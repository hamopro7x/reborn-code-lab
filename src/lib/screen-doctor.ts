// روبوت الوصول عن بعد: يراقب كل شاشة موظف، وإذا تأخّر البث أكثر من 3 ثوانٍ
// يحدّد سبب المشكلة (شبكة الأدمن / قناة الإشارات / مسار WebRTC / برنامج
// الموظف نفسه) وينفّذ الإصلاح المناسب تلقائياً. إذا كانت المشكلة من برنامج
// الموظف يعمل تحديث لصفحة البرنامج تلقائياً، وإذا كان البرنامج معلّقاً أو
// إصداره قديم (نت مقطوع وتراكمت التحديثات) ينزّل آخر إصدار ويثبته.
import { AGENT_RELEASE } from "@/lib/agent-release";
import { getOpenScreenSession, type ScreenSession } from "@/lib/screen-session";
import { warmIceServers } from "@/lib/screenshare";

export const STALL_MS = 3_000;
const COOLDOWN_MS = 8_000;
const OFFLINE_MS = 150_000;

export type DoctorEvent = {
  id: string;
  at: number;
  deviceId: string;
  deviceName: string;
  cause: string;
  action: string;
  level: "info" | "warn" | "fix";
};

export type DoctorTarget = {
  deviceId: string;
  name: string;
  lastSeenAt: string | null;
  appVersion: string | null;
};

type Track = { attempts: number; lastActionAt: number; firstAttemptAt: number };

const tracks = new Map<string, Track>();
let events: DoctorEvent[] = [];
let enabled = true;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let targets: DoctorTarget[] = [];

function emit() {
  for (const cb of listeners) cb();
}

export function subscribeDoctor(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getDoctorEvents(): DoctorEvent[] {
  return events;
}

export function isDoctorEnabled(): boolean {
  return enabled;
}

export function setDoctorEnabled(v: boolean) {
  enabled = v;
  if (!v) tracks.clear();
  emit();
}

function log(e: Omit<DoctorEvent, "id" | "at">) {
  events = [
    { ...e, id: Math.random().toString(36).slice(2), at: Date.now() },
    ...events,
  ].slice(0, 40);
  emit();
}

function isOutdated(version: string | null): boolean {
  if (!version) return true;
  const a = version.split(".").map((n) => Number(n) || 0);
  const b = AGENT_RELEASE.version.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) < (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) > (b[i] ?? 0)) return false;
  }
  return false;
}

/** يفحص جلسة واحدة ويطبّق الإصلاح المناسب */
async function inspect(target: DoctorTarget, session: ScreenSession) {
  const now = Date.now();
  const online =
    !!target.lastSeenAt && now - new Date(target.lastSeenAt).getTime() < OFFLINE_MS;
  const key = target.deviceId;
  const track = tracks.get(key) ?? { attempts: 0, lastActionAt: 0, firstAttemptAt: now };

  const reference = Math.max(session.lastFrameAt, session.startedAt);
  const stalled = now - reference > STALL_MS;

  if (!stalled) {
    if (track.attempts > 0) {
      log({
        deviceId: key,
        deviceName: target.name,
        cause: "تم استرجاع البث",
        action: "الشاشة تعمل الآن بشكل طبيعي",
        level: "info",
      });
    }
    tracks.delete(key);
    return;
  }

  if (!online) {
    // الجهاز مغلق فعلاً — لا شيء يمكن إصلاحه من هنا
    tracks.delete(key);
    return;
  }

  if (now - track.lastActionAt < COOLDOWN_MS) return;
  if (track.attempts === 0) track.firstAttemptAt = now;
  track.attempts += 1;
  track.lastActionAt = now;
  tracks.set(key, track);

  const base = { deviceId: key, deviceName: target.name };

  // 1) شبكة الأدمن نفسها
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    log({ ...base, cause: "انقطاع الإنترنت في جهاز الإدارة", action: "انتظار عودة الشبكة", level: "warn" });
    return;
  }

  // 2) إصدار قديم متراكم أو محاولات متكررة فشلت → تحديث كامل لآخر إصدار
  if (isOutdated(target.appVersion) || track.attempts >= 3) {
    const sent = await session.sendCommand("update");
    log({
      ...base,
      cause: isOutdated(target.appVersion)
        ? `إصدار برنامج الموظف قديم (${target.appVersion ?? "غير معروف"}) — تحديثات متراكمة`
        : "المشكلة مستمرة بعد عدة إصلاحات — البرنامج معلّق",
      action: sent
        ? `تنزيل وتثبيت آخر إصدار v${AGENT_RELEASE.version} ثم إعادة تشغيل البرنامج`
        : "تعذّر إرسال أمر التحديث — إعادة بناء الاتصال",
      level: "fix",
    });
    if (!sent) session.hardReset();
    return;
  }

  // 3) لم يصل أي عرض اتصال من البرنامج مع أن الجهاز متصل → واجهة البرنامج معلّقة
  if (session.offerAt === 0) {
    const sent = await session.sendCommand("reload");
    log({
      ...base,
      cause: "برنامج الموظف متصل لكنه لا يرسل البث (الواجهة معلّقة)",
      action: sent ? "تحديث صفحة برنامج الموظف تلقائياً" : "إعادة بناء قناة الإشارات",
      level: "fix",
    });
    if (!sent) {
      await warmIceServers();
      session.hardReset();
    }
    return;
  }

  // 4) قناة الإشارات لا تعمل
  if (session.sigFailed) {
    await warmIceServers();
    session.hardReset();
    log({ ...base, cause: "فشل قناة الإشارات بين اللوحة والبرنامج", action: "تجديد خوادم الاتصال وبناء مسار جديد", level: "fix" });
    return;
  }

  // 5) الاتصال قائم لكن لا تصل إطارات → التقاط الشاشة عند الموظف متجمّد
  if (session.connState === "connected") {
    const sent = await session.sendCommand("renew");
    log({
      ...base,
      cause: "الاتصال قائم لكن الصورة متوقفة — التقاط الشاشة متجمّد في برنامج الموظف",
      action: sent ? "تجديد التقاط الشاشة عن بعد" : "إعادة بناء مسار البث",
      level: "fix",
    });
    if (!sent) session.hardReset();
    return;
  }

  // 6) مسار الشبكة بين الطرفين ساقط
  await warmIceServers();
  session.hardReset();
  log({
    ...base,
    cause: `مسار الاتصال متوقف (${session.connState})`,
    action: "إعادة بناء اتصال البث من الصفر",
    level: "fix",
  });
}

async function tick() {
  if (!enabled) return;
  for (const t of targets) {
    const session = getOpenScreenSession(t.deviceId);
    if (!session) continue;
    try {
      await inspect(t, session);
    } catch {
      /* لا نوقف الروبوت بسبب جهاز واحد */
    }
  }
}

/** تُحدّث قائمة الأجهزة التي يراقبها الروبوت (تُستدعى من لوحة الإدارة) */
export function setDoctorTargets(next: DoctorTarget[]) {
  targets = next;
  if (!timer && typeof window !== "undefined") {
    timer = setInterval(() => void tick(), 1_000);
  }
}
