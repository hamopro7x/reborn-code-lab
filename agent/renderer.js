import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://shrrrgvcrevujivuyvzv.supabase.co";
const SUPABASE_KEY = "sb_publishable_nJ6QLZiRdWnK9_qtFKPZjQ_hDkY5zrz";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const consentEl = document.getElementById("consent");
const runningEl = document.getElementById("running");
const pairingEl = document.getElementById("pairing");
const pairCodeEl = document.getElementById("pair-code");
const pairStatusEl = document.getElementById("pair-status");
const nameEl = document.getElementById("employee-name");
const approveBtn = document.getElementById("approve");
const statusEl = document.getElementById("status");
const dotEl = document.getElementById("dot");
const deviceEl = document.getElementById("device");

const STORE = "mag-agent-device-v1";
const AGENT_VERSION = "1.7.8";


const updateEl = document.getElementById("update");
const updVerEl = document.getElementById("upd-ver");
const updBtn = document.getElementById("upd-btn");
const updBar = document.getElementById("upd-bar");
const updFill = document.getElementById("upd-fill");
const updProg = document.getElementById("upd-progress");
const updLater = document.getElementById("upd-later");

const mb = (n) => (n / 1048576).toFixed(1) + " MB";

window.agent.onUpdateProgress?.(({ received, total, percent }) => {
  updBar.style.display = "block";
  if (percent != null) {
    const safePercent = Math.min(100, Math.max(0, percent));
    updFill.style.width = safePercent + "%";
    updProg.textContent = `جارٍ التحميل… ${safePercent}% (${mb(Math.min(received, total))} / ${mb(total)})`;
  } else {
    updFill.style.width = "100%";
    updProg.textContent = `جارٍ التحميل… ${mb(received)}`;
  }
});

async function startDownload(info, autoInstall = false) {
  if (!info?.url) return;
  if (updateBusy) return; // منع تحميل ثانٍ متزامن على نفس الملف
  updateBusy = true;
  updLater.style.display = "none";
  updBtn.disabled = true;
  updBtn.textContent = "جارٍ التحميل…";
  updBar.style.display = "block";
  updFill.style.width = "0%";
  updProg.textContent = "جارٍ بدء التحميل…";
  try {
    await window.agent.downloadUpdate(info.url, info.version);
    updFill.style.width = "100%";
    updProg.textContent = "تم التحميل — جاهز للتثبيت";
    updBtn.textContent = "تثبيت";
    updBtn.disabled = false;
    const install = async () => {
      updBtn.disabled = true;
      updBtn.textContent = "جارٍ التثبيت…";
      updProg.textContent = "سيتم إعادة تشغيل البرنامج بعد التثبيت…";
      try {
        await window.agent.installUpdate();
      } catch (err) {
        updProg.textContent = "فشل التثبيت: " + (err?.message || err);
        updBtn.textContent = "إعادة المحاولة";
        updBtn.disabled = false;
      }
    };
    updBtn.onclick = install;
    if (autoInstall) void install();
  } catch (err) {
    updProg.textContent = "فشل التحميل: " + (err?.message || err);
    updBtn.textContent = "إعادة المحاولة";
    updBtn.disabled = false;
    updBtn.onclick = () => startDownload(info);
  } finally {
    // مهم: بدون تصفير الحالة كان الفحص التلقائي للتحديث يتوقف للأبد
    updateBusy = false;
  }
}

function cmpVersion(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

let updateBusy = false;
let dismissedVersion = null;

async function checkUpdate() {
  if (updateBusy) return; // تحميل/تثبيت جارٍ — لا نلمس الواجهة
  try {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "agent_update")
      .maybeSingle();
    const info = data?.value;
    if (!info?.version || cmpVersion(info.version, AGENT_VERSION) <= 0) {
      updateEl.style.display = "none";
      return;
    }
    if (info.version === dismissedVersion) return;
    updVerEl.textContent = "v" + info.version;
    updBtn.onclick = () => startDownload(info);
    if (!updateBusy) {
      updBtn.textContent = "تحميل التحديث";
      updBtn.disabled = false;
    }
    updLater.style.display = "inline-block";
    updLater.onclick = () => {
      dismissedVersion = info.version;
      updateEl.style.display = "none";
    };
    updateEl.style.display = "flex";
    // تحديث تلقائي في الخلفية: ينزل ويثبت بدون تدخل الموظف
    void startDownload(info, true);
  } catch {
    /* تجاهل — نحاول لاحقاً */
  }
}


function rand(len) {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

function loadDevice() {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDevice(d) {
  localStorage.setItem(STORE, JSON.stringify(d));
}

function setStatus(text, on) {
  statusEl.textContent = text;
  dotEl.classList.toggle("on", !!on);
}

function osLabel() {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Device";
}

async function captureScreen() {
  const sourceId = await window.agent.getScreenSource();
  if (!sourceId) throw new Error("لا توجد شاشة متاحة");
  // أقصى وضوح ممكن *بدون* تأخير: نحدّ الدقة عند 1440p كحد أعلى.
  // الدقة الأعلى (4K/8K) تُشبع الشبكة فيتكوّن طابور بيانات = بث متأخر.
  const dpr = window.devicePixelRatio || 1;
  const rawW = Math.round((window.screen?.width || 1920) * dpr);
  const rawH = Math.round((window.screen?.height || 1080) * dpr);
  const scale = Math.min(1, 2560 / rawW, 1440 / rawH);
  const capW = Math.round(rawW * scale);
  const capH = Math.round(rawH * scale);
  const tryCapture = async (w, h, fps) =>
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          maxWidth: w,
          maxHeight: h,
          maxFrameRate: fps,
        },
      },
    });
  try {
    return await tryCapture(capW, capH, 60);
  } catch {
    try {
      return await tryCapture(1920, 1080, 60);
    } catch {
      return await tryCapture(1280, 720, 30);
    }
  }
}


// نُفضّل H264 (يعطي وضوح أفضل للنصوص عند نفس البت-ريت) ثم VP9 ثم VP8.
function preferCodec(pc) {
  try {
    const caps = RTCRtpSender.getCapabilities?.("video");
    if (!caps) return;
    const order = ["video/H264", "video/VP9", "video/AV1", "video/VP8"];
    const sorted = [...caps.codecs].sort(
      (a, b) => order.indexOf(a.mimeType) - order.indexOf(b.mimeType),
    );
    for (const tr of pc.getTransceivers()) {
      if (tr.sender?.track?.kind === "video" || tr.receiver?.track?.kind === "video") {
        tr.setCodecPreferences?.(sorted);
      }
    }
  } catch {
    /* غير مدعوم */
  }
}


// بت-ريت واقعي عالي: يبدأ سريع بدون إشباع الشبكة (الإشباع = تأخير متراكم)
function boostSdp(sdp) {
  const lines = sdp.split(/\r?\n/);
  const out = [];
  let inVideo = false;
  for (const line of lines) {
    if (line.startsWith("m=")) inVideo = line.startsWith("m=video");
    out.push(line);
    if (inVideo && line.startsWith("m=video")) continue;
    if (inVideo && /^a=fmtp:\d+ /.test(line)) {
      out[out.length - 1] =
        line +
        ";x-google-start-bitrate=6000;x-google-min-bitrate=1500;x-google-max-bitrate=14000";
    }
  }
  // b=AS بعد سطر c= الخاص بالفيديو
  const res = [];
  let seenVideo = false;
  for (const line of out) {
    if (line.startsWith("m=")) seenVideo = line.startsWith("m=video");
    res.push(line);
    if (seenVideo && line.startsWith("c=")) res.push("b=AS:14000", "b=TIAS:14000000");
  }
  return res.join("\r\n");
}

let stream = null;
let channel = null;
let pc = null;

function send(signal) {
  return channel.send({ type: "broadcast", event: "signal", payload: signal });
}

async function getStream() {
  if (stream && stream.getTracks().some((t) => t.readyState === "live")) return stream;
  stream = await captureScreen();
  return stream;
}

// مراقبة الشبكة: لو تكوّن طابور إرسال (تأخير) نخفّض البت-ريت فوراً،
// ولو الشبكة مرتاحة نرفعه تدريجياً — هذا ما يمنع تراكم التأخير.
let statsTimer = null;

function startAdaptive(sender) {
  if (statsTimer) clearInterval(statsTimer);
  const MIN = 1_500_000;
  const MAX = 14_000_000;
  let target = 6_000_000;
  let lastLost = 0;
  let lastPackets = 0;
  statsTimer = setInterval(async () => {
    if (!pc || pc.connectionState !== "connected") return;
    try {
      const stats = await sender.getStats();
      let rtt = 0;
      let lost = 0;
      let packets = 0;
      stats.forEach((r) => {
        if (r.type === "remote-inbound-rtp") {
          if (typeof r.roundTripTime === "number") rtt = r.roundTripTime;
          if (typeof r.packetsLost === "number") lost = r.packetsLost;
        }
        if (r.type === "outbound-rtp" && typeof r.packetsSent === "number") packets = r.packetsSent;
      });
      const dLost = Math.max(0, lost - lastLost);
      const dPackets = Math.max(1, packets - lastPackets);
      lastLost = lost;
      lastPackets = packets;
      const lossRate = dLost / dPackets;
      if (rtt > 0.25 || lossRate > 0.03) target = Math.max(MIN, Math.round(target * 0.6));
      else if (rtt < 0.12 && lossRate < 0.005) target = Math.min(MAX, Math.round(target * 1.15));
      const params = sender.getParameters();
      if (params.encodings?.[0]) {
        params.encodings[0].maxBitrate = target;
        await sender.setParameters(params);
      }
    } catch {
      /* تجاهل */
    }
  }, 2000);
}

let starting = false;

async function startPeer() {
  if (starting) return; // منع بدء أكثر من اتصال في نفس الوقت
  starting = true;
  try {
  pc?.close();
  const s = await getStream();
  pc = new RTCPeerConnection(RTC_CONFIG);
  s.getVideoTracks().forEach((t) => {
    t.contentHint = "detail"; // وضوح النصوص مع سماح بتقليل الدقة عند الحاجة
  });
  s.getTracks().forEach((t) => pc.addTrack(t, s));
  preferCodec(pc);

  let videoSender = null;
  for (const sender of pc.getSenders()) {
    if (!sender.track || sender.track.kind !== "video") continue;
    videoSender = sender;
    try {
      const params = sender.getParameters();
      // "balanced": يُفضّل استمرار سرعة البث على التمسك بالدقة = أقل تأخير
      params.degradationPreference = "balanced";
      params.encodings = [
        {
          ...(params.encodings?.[0] ?? {}),
          maxBitrate: 6_000_000,
          maxFramerate: 60,
          scaleResolutionDownBy: 1,
          networkPriority: "high",
          priority: "high",
        },
      ];
      await sender.setParameters(params);
    } catch {
      // بعض النسخ لا تدعم كل الخصائص
    }
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) void send({ type: "ice", from: "host", candidate: e.candidate.toJSON() });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") setStatus("متصل", true);
    if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
      if (statsTimer) clearInterval(statsTimer);
      statsTimer = null;
      try { pc.close(); } catch {}
      pc = null;
      setStatus("متصل", true);
    }
  };
  const offer = await pc.createOffer();
  offer.sdp = boostSdp(offer.sdp);
  await pc.setLocalDescription(offer);
  await send({ type: "offer", sdp: { type: offer.type, sdp: offer.sdp } });
  if (videoSender) startAdaptive(videoSender);
  } finally {
    starting = false;
  }
}

async function heartbeat(device) {
  try {
    const data = await rpcFetch("agent_heartbeat", {
      p_device_id: device.device_id,
      p_secret: device.secret,
      p_version: AGENT_VERSION,
    });
    return data === true;
  } catch {
    return null; // offline — retry next tick
  }
}


let hbTimer = null;
let pairTimer = null;
let updTimer = null;
let running = false;

function stopSession() {
  running = false;
  if (hbTimer) clearInterval(hbTimer);
  hbTimer = null;
  try { pc?.close(); } catch {}
  pc = null;
  try { if (channel) supabase.removeChannel(channel); } catch {}
  channel = null;
}

// ============ شاشة مفتاح الربط ============
// نستخدم fetch مباشر مع مهلة زمنية بدل supabase-js عشان الطلب ميعلّقش للأبد
async function rpcFetch(fn, body, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } finally {
    clearTimeout(t);
  }
}

async function requestPairing(device) {
  return rpcFetch("agent_pair_request", {
    p_device_id: device.device_id,
    p_secret: device.secret,
    p_employee_name: device.employee_name || null,
    p_device_label: osLabel() + " · " + (navigator.platform || ""),
    p_os: osLabel(),
  });
}

async function showPairing(device, note) {
  stopSession();
  consentEl.style.display = "none";
  runningEl.style.display = "none";
  pairingEl.style.display = "flex";
  pairStatusEl.textContent = note || "جارٍ توليد المفتاح…";

  const tick = async () => {
    try {
      const code = await requestPairing(device);
      if (code === "REGISTERED") {
        if (pairTimer) clearInterval(pairTimer);
        pairTimer = null;
        pairingEl.style.display = "none";
        await run(device);
        return;
      }
      if (typeof code === "string" && code.length >= 6) {
        pairCodeEl.textContent = code;
        pairStatusEl.textContent = "في انتظار موافقة الإدارة…";
      } else {
        pairStatusEl.textContent = "تعذّر توليد المفتاح — إعادة المحاولة…";
      }
    } catch (err) {
      pairStatusEl.textContent =
        "تعذّر الاتصال بالسيرفر — إعادة المحاولة… " + String(err?.message || err).slice(0, 80);
    }
  };

  if (!pairTimer) pairTimer = setInterval(() => void tick(), 5000);
  void tick();
}


async function run(device) {
  if (running) return;
  running = true;
  try { await window.agent.enableAutoLaunch(); } catch {}
  consentEl.style.display = "none";
  pairingEl.style.display = "none";
  runningEl.style.display = "flex";
  deviceEl.textContent = `${device.employee_name || "موظف"} · ${device.device_id.slice(0, 8)}`;
  setStatus("جارٍ الاتصال بالسيرفر…", false);

  const first = await heartbeat(device);
  if (first === false) {
    // الإدارة حذفت الجهاز — نطلب مفتاح ربط جديد
    return showPairing(device, "تم حذف تسجيل هذا الجهاز — سلّم المفتاح للإدارة");
  }

  hbTimer = setInterval(async () => {
    const ok = await heartbeat(device);
    if (ok === false) void showPairing(device, "تم حذف تسجيل هذا الجهاز — سلّم المفتاح للإدارة");
  }, 20000);

  void checkUpdate();
  // فحص دوري كل دقيقة كخطة احتياطية لو الريلتايم اتقطع
  setInterval(() => void checkUpdate(), 60000);
  // اشتراك فوري: أي تحديث جديد يتحفظ في site_settings يظهر مباشرة
  try {
    supabase
      .channel("agent-update-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "site_settings", filter: "key=eq.agent_update" },
        () => void checkUpdate(),
      )
      .subscribe();
  } catch {}


  channel = supabase.channel(`screenshare-${device.device_id}`, {
    config: { broadcast: { self: false } },
  });
  channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
    const s = payload;
    try {
      if (s.type === "join") {
        await startPeer();
      } else if (s.type === "answer") {
        // نتجاهل أي إجابة مكرّرة (لو أكثر من مشاهد أرسل إجابة لنفس العرض)
        if (pc && pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(s.sdp);
        }
      } else if (s.type === "ice" && s.from === "viewer") {
        if (pc) await pc.addIceCandidate(s.candidate).catch(() => {});
      } else if (s.type === "bye") {
        pc?.close();
        pc = null;
        setStatus("متصل", true);
      }
    } catch (err) {
      setStatus("خطأ: " + (err?.message || err), false);
    }
  });
  const subscribed = await new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
    const t = setTimeout(() => finish(false), 15000);
    channel.subscribe((st) => {
      if (st === "SUBSCRIBED") { clearTimeout(t); finish(true); }
      else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(st)) { clearTimeout(t); finish(false); }
    });
  });
  if (!subscribed) {
    setStatus("تعذّر الاتصال — إعادة المحاولة…", false);
    try { await supabase.removeChannel(channel); } catch {}
    setTimeout(() => { if (running) void run(device); }, 5000);
    return;
  }
  setStatus("متصل", true);
}

approveBtn.addEventListener("click", async () => {
  approveBtn.disabled = true;
  const employee_name = nameEl.value.trim();
  if (!employee_name) {
    approveBtn.disabled = false;
    return alert("اكتب اسمك أولاً");
  }
  const device = { device_id: rand(16), secret: rand(24), employee_name };
  try {
    // نطلب صلاحية الشاشة مرة واحدة هنا للتأكد أنها تعمل
    await getStream();
    const { error } = await supabase.rpc("agent_register", {
      p_device_id: device.device_id,
      p_secret: device.secret,
      p_employee_name: employee_name,
      p_device_label: osLabel() + " · " + (navigator.platform || ""),
      p_os: osLabel(),
      p_version: AGENT_VERSION,
    });
    if (error) throw error;
    saveDevice(device);
    try { await window.agent.enableAutoLaunch(); } catch {}
    await run(device);
  } catch (err) {
    approveBtn.disabled = false;
    alert("فشل التسجيل: " + (err?.message || err));
  }
});

const existing = loadDevice();
if (existing) {
  void run(existing);
} else {
  consentEl.style.display = "flex";
  runningEl.style.display = "none";
  pairingEl.style.display = "none";
}

// فحص التحديث بشكل مستقل عن الجلسة — كل دقيقة والبرنامج مفتوح
void checkUpdate();
updTimer = setInterval(() => void checkUpdate(), 60 * 1000);
window.addEventListener("focus", () => void checkUpdate());

// إعادة اتصال ناعمة: تعيد قناة الإشارات فقط دون إعادة تحميل الصفحة،
// وبالتالي يفضل البث (WebRTC) شغالاً كما هو بدون الحاجة لاتصال جديد.
let reconnecting = false;
async function softReconnect() {
  if (reconnecting) return;
  const d = loadDevice();
  if (!d) return;
  reconnecting = true;
  try {
    if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    if (channel) { try { await supabase.removeChannel(channel); } catch {} channel = null; }
    running = false; // ملاحظة: لا نلمس pc/stream إطلاقاً حتى لا ينقطع البث
    await run(d);
  } finally {
    reconnecting = false;
  }
}

// زر التحديث أعلى اليمين: يفحص التحديثات ويجدّد الاتصال بدون إعادة تحميل
document.getElementById("refresh")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.classList.add("spin");
  try {
    await checkUpdate();
    await softReconnect();
  } finally {
    setTimeout(() => btn.classList.remove("spin"), 600);
  }
});

// إعادة الاتصال تلقائياً لما الشبكة ترجع (بعد قفل اللابتوب/فقد النت)
window.addEventListener("online", () => {
  setTimeout(() => void softReconnect(), 1500);
});

