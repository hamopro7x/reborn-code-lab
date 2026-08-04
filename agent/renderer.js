import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://shrrrgvcrevujivuyvzv.supabase.co";
const SUPABASE_KEY = "sb_publishable_nJ6QLZiRdWnK9_qtFKPZjQ_hDkY5zrz";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // مُرحّل (TURN) كخط بديل: يمنع فشل/تعليق البث على شبكات NAT الصعبة
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  iceCandidatePoolSize: 4,
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
const enrollEl = document.getElementById("enroll-code");
const consentNoteEl = document.getElementById("consent-note");
const approveBtn = document.getElementById("approve");
const statusEl = document.getElementById("status");
const dotEl = document.getElementById("dot");
const deviceEl = document.getElementById("device");

const STORE = "mag-agent-device-v1";
// رقم الإصدار الحقيقي من الحزمة المثبتة. نستخدم مهلة قصيرة حتى لو IPC تأخر
// لا تفضل الواجهة فاضية للأبد (كان await بدون مهلة يوقف كل السكربت).
const AGENT_VERSION = await Promise.race([
  window.agent?.getVersion?.().catch(() => "0.0.0") ?? Promise.resolve("0.0.0"),
  new Promise((resolve) => setTimeout(() => resolve("0.0.0"), 3000)),
]);

const verBadgeEl = document.getElementById("ver-badge");
if (verBadgeEl) verBadgeEl.textContent = "v" + AGENT_VERSION;




const updateEl = document.getElementById("update");
const updVerEl = document.getElementById("upd-ver");
const updBtn = document.getElementById("upd-btn");
const updBar = document.getElementById("upd-bar");
const updFill = document.getElementById("upd-fill");
const updProg = document.getElementById("upd-progress");
const updLater = document.getElementById("upd-later");

const size = (n) => {
  const v = Number(n) || 0;
  return v >= 1073741824 ? (v / 1073741824).toFixed(2) + " GB" : (v / 1048576).toFixed(1) + " MB";
};

// شريط التقدّم أسفل رقم الإصدار: النسبة المئوية + الحجم المحمّل من الإجمالي
const topProg = document.getElementById("top-progress");
const topFill = document.getElementById("top-fill");
const topText = document.getElementById("top-text");
let hideProgTimer = null;

function showProgress(received, total, percent) {
  if (!topProg) return;
  topProg.style.display = "flex";
  const pct = percent ?? (total ? Math.round((received / total) * 100) : 0);
  if (topFill) topFill.style.width = Math.max(0, Math.min(100, pct)) + "%";
  if (topText)
    topText.textContent = `${pct}% · ${size(received)}${total ? " / " + size(total) : ""}`;
  if (hideProgTimer) clearTimeout(hideProgTimer);
  if (pct >= 100) {
    hideProgTimer = setTimeout(() => {
      if (topProg) topProg.style.display = "none";
    }, 4000);
  }
}

window.agent.onUpdateProgress?.((p) => {
  if (!p) return;
  showProgress(p.received || 0, p.total || 0, p.percent);
});

async function startDownload(info, autoInstall = false) {
  if (!info?.url) return;
  if (updateBusy) return; // منع تحميل ثانٍ متزامن على نفس الملف
  updateBusy = true;
  // بدون إشعارات أو أزرار — يظهر شريط التقدّم فقط أسفل رقم الإصدار
  updateEl.style.display = "none";
  showProgress(0, 0, 0);
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
    updProg.textContent = "فشل التحميل: " + (err?.message || err) + " — إعادة المحاولة تلقائياً…";
    updBtn.textContent = "جارٍ التحديث تلقائياً…";
    updBtn.disabled = true;
    updBtn.onclick = null;
    // إعادة محاولة تلقائية بدون تدخل الموظف
    setTimeout(() => {
      updateBusy = false;
      void startDownload(info, true);
    }, 30000);
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
  if (updateBusy) return; // تحميل/تثبيت جارٍ
  try {
    // المصدر الوحيد للتحديث = الموقع المنشور. لا يظهر أي تحديث للموظف
    // إلا بعد نشر النسخة الجديدة من لوحة الموقع (Publish changes).
    const res = await fetch("https://mag-pro1.com/api/public/agent-version", {
      cache: "no-store",
    });
    const info = await res.json();
    if (!info?.version || cmpVersion(info.version, AGENT_VERSION) <= 0) return;
    // تحديث صامت بالكامل: بدون أي إشعار أو زر — ينزل ويثبت في الخلفية.
    updateEl.style.display = "none";
    void startDownload(
      { version: info.version, url: "https://mag-pro1.com/api/public/agent-download.exe" },
      true,
    );
  } catch {
    /* تجاهل — نحاول لاحقاً */
  }
}



// عملية Electron الخلفية هي المصدر الوحيد للتحديث، حتى لا يبدأ تنزيلان لنفس
// الملف من الواجهة والخلفية في الوقت نفسه.

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
  // دقة عالية ثابتة: نلتقط بدقة الشاشة الأصلية (حتى 2560x1440) بدون تصغير
  // أثناء الحركة، مع bitrate عالٍ للحفاظ على حدة النصوص والتفاصيل.
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
    return await tryCapture(capW, capH, 30);
  } catch {
    try {
      return await tryCapture(1920, 1080, 30);
    } catch {
      return await tryCapture(1280, 720, 30);
    }
  }
}


let stream = null;
let channel = null;
let signalTimer = null;
let signalPolling = false;
const outgoingSignals = [];
// كل مشاهد (جهاز إدارة) له اتصال منفصل بنفس جودة وسرعة البث
const peers = new Map(); // viewerId -> { pc, statsTimer }

function send(signal) {
  const viewerId = signal.viewer || signal.to;
  if (!viewerId) return Promise.reject(new Error("missing viewer identity"));
  outgoingSignals.push({ viewer_id: viewerId, payload: signal });
  return Promise.resolve();
}

async function exchangeSignals(device) {
  if (signalPolling) return;
  signalPolling = true;
  const batch = outgoingSignals.splice(0);
  try {
    const incoming = await rpcFetch("agent_exchange_signals", {
      p_device_id: device.device_id,
      p_secret: device.secret,
      p_outgoing: batch,
    }, 5000);
    for (const row of Array.isArray(incoming) ? incoming : []) {
      await handleViewerSignal(row.payload);
    }
  } catch {
    outgoingSignals.unshift(...batch);
  } finally {
    signalPolling = false;
  }
}

async function handleViewerSignal(s) {
  const viewerId = s.viewer || s.from_id;
  if (!viewerId) return;
  if (s.type === "join") {
    await startPeer(viewerId);
  } else if (s.type === "answer") {
    const entry = peers.get(viewerId);
    if (entry?.pc && entry.pc.signalingState === "have-local-offer") {
      await entry.pc.setRemoteDescription(s.sdp);
      for (const candidate of entry.pendingIce.splice(0)) {
        await entry.pc.addIceCandidate(candidate).catch(() => {});
      }
    }
  } else if (s.type === "ice" && s.from === "viewer") {
    const entry = peers.get(viewerId);
    if (entry?.pc?.remoteDescription) await entry.pc.addIceCandidate(s.candidate).catch(() => {});
    else if (entry) entry.pendingIce.push(s.candidate);
  } else if (s.type === "bye") {
    closePeer(viewerId);
  }
}

async function getStream() {
  if (stream && stream.getTracks().some((t) => t.readyState === "live")) return stream;
  stream = await captureScreen();
  return stream;
}

// متحكّم quality-first: الدقة ثابتة دائماً (بدون تصغير) والجودة عالية جداً.
// أثناء الحركة لا نخفض الوضوح — نتحكّم فقط في الـ bitrate ضمن سقف عالٍ.
function startAdaptive(entry, sender) {
  if (entry.statsTimer) clearInterval(entry.statsTimer);

  const MIN = 6_000_000;   // أرضية عالية: لا تقل الجودة عند الحركة
  const MAX = 40_000_000;  // سقف عالي جداً لأعلى كفاءة وضوح
  let target = 14_000_000;
  let lastLost = 0;
  let lastPackets = 0;
  entry.statsTimer = setInterval(async () => {
    if (!entry.pc || entry.pc.connectionState !== "connected") return;
    try {
      const stats = await sender.getStats();
      let rtt = 0;
      let lost = 0;
      let packets = 0;
      let avail = 0;
      stats.forEach((r) => {
        if (r.type === "remote-inbound-rtp") {
          if (typeof r.roundTripTime === "number") rtt = r.roundTripTime;
          if (typeof r.packetsLost === "number") lost = r.packetsLost;
        }
        if (r.type === "candidate-pair" && r.state === "succeeded") {
          if (typeof r.availableOutgoingBitrate === "number") avail = r.availableOutgoingBitrate;
          if (typeof r.currentRoundTripTime === "number" && !rtt) rtt = r.currentRoundTripTime;
        }
      });
      const dLost = Math.max(0, lost - lastLost);
      const dPackets = Math.max(1, packets - lastPackets);
      lastLost = lost;
      lastPackets = packets;
      const lossRate = dLost / dPackets;

      const severe = rtt > 0.5 || lossRate > 0.12;
      if (avail > 0) {
        const safe = Math.round(avail * 0.95);
        if (severe) target = Math.max(MIN, Math.min(Math.round(target * 0.85), safe));
        else target = Math.min(MAX, Math.max(safe, Math.round(target * 1.2 + 1_000_000)));
      } else if (severe) {
        target = Math.round(target * 0.85);
      } else {
        target = Math.round(target * 1.2 + 1_000_000);
      }
      target = Math.max(MIN, Math.min(MAX, target));

      const params = sender.getParameters();
      if (params.encodings?.[0]) {
        params.degradationPreference = "maintain-resolution";
        params.encodings[0].maxBitrate = target;
        params.encodings[0].maxFramerate = 30;
        // الدقة الكاملة دائماً — لا تصغير مهما كانت الحركة
        params.encodings[0].scaleResolutionDownBy = 1;
        await sender.setParameters(params);
      }
    } catch {
      /* تجاهل */
    }
  }, 1000);
}



function closePeer(viewerId) {
  const entry = peers.get(viewerId);
  if (!entry) return;
  if (entry.statsTimer) clearInterval(entry.statsTimer);
  if (entry.recoverTimer) clearTimeout(entry.recoverTimer);
  try { entry.pc.close(); } catch {}
  // نوقف نسخة المسار الخاصة بهذا المشاهد فقط — المصدر يبقى للباقين
  try { entry.track?.stop(); } catch {}
  peers.delete(viewerId);
  window.agent.setViewerCount?.(peers.size);
  setStatus(peers.size > 0 ? `متصل · ${peers.size} مشاهد` : "متصل", true);
}

const startingViewers = new Set();

async function startPeer(viewerId) {
  if (startingViewers.has(viewerId)) return; // منع بدء اتصالين لنفس المشاهد
  const current = peers.get(viewerId);
  if (current?.pc && ["new", "connecting", "connected"].includes(current.pc.connectionState)) {
    // طلب JOIN المتكرر يعني غالباً أن أول OFFER لم يصل للمشاهد. نعيد نفس العرض
    // فوراً بدل ترك الشاشة معلقة حتى انتهاء مهلة إعادة الاتصال.
    if (current.offer && current.pc.connectionState !== "connected") {
      await send({ type: "offer", to: viewerId, sdp: current.offer });
    }
    return;
  }
  startingViewers.add(viewerId);
  try {
    closePeer(viewerId); // أي اتصال قديم لنفس المشاهد يُستبدل
    const s = await getStream();
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const entry = { pc, statsTimer: null, pendingIce: [], recoverTimer: null, offer: null };
    peers.set(viewerId, entry);
    window.agent.setViewerCount?.(peers.size);

    // كل مشاهد يحصل على نسخة مستقلة من مسار الشاشة (clone) => مشفّر منفصل
    // ومعدّل بت-ريت منفصل. مشاركة نفس المسار بين اتصالين كانت تجعل
    // التكيّف (scaleResolutionDownBy/framerate) يتصارع فيتوقف البث الثاني.
    const base = s.getVideoTracks()[0];
    if (!base) throw new Error("لا يوجد مسار فيديو");
    const track = base.clone();
    track.contentHint = "detail";
    entry.track = track;
    pc.addTrack(track, new MediaStream([track]));

    let videoSender = null;
    for (const sender of pc.getSenders()) {
      if (!sender.track || sender.track.kind !== "video") continue;
      videoSender = sender;
      try {
        const params = sender.getParameters();
        // الحفاظ على الدقة مع إسقاط الإطارات عند اللزوم يمنع طابور frames قديم.
        params.degradationPreference = "maintain-resolution";
        params.encodings = [
          {
            ...(params.encodings?.[0] ?? {}),
            // جودة عالية ثابتة من أول إطار — لا تنخفض مع الحركة
            maxBitrate: 14_000_000,
            maxFramerate: 30,
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
      if (e.candidate)
        void send({ type: "ice", from: "host", to: viewerId, candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        if (entry.recoverTimer) { clearTimeout(entry.recoverTimer); entry.recoverTimer = null; }
        setStatus(`متصل · ${peers.size} مشاهد`, true);
        // اطلب keyframe فور اكتمال ICE لتظهر الصورة بدون انتظار دورة المشفّر.
        try { videoSender?.generateKeyFrame?.(); } catch {}
      }
      // انقطاع مؤقت للشبكة: نحاول إصلاح مسار ICE بدل قطع البث فوراً
      if (pc.connectionState === "disconnected") {
        try { pc.restartIce(); } catch {}
        if (!entry.recoverTimer) {
          entry.recoverTimer = setTimeout(() => {
            entry.recoverTimer = null;
            if (pc.connectionState !== "connected") closePeer(viewerId);
          }, 8000);
        }
        return;
      }
      if (["failed", "closed"].includes(pc.connectionState)) {
        closePeer(viewerId);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    entry.offer = { type: offer.type, sdp: offer.sdp };
    await send({ type: "offer", to: viewerId, sdp: entry.offer });
    if (videoSender) startAdaptive(entry, videoSender);
  } finally {
    startingViewers.delete(viewerId);
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
let running = false;

function stopSession() {
  running = false;
  if (hbTimer) clearInterval(hbTimer);
  hbTimer = null;
  if (signalTimer) clearInterval(signalTimer);
  signalTimer = null;
  for (const id of Array.from(peers.keys())) closePeer(id);
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

// لا يوجد مفتاح يولّده البرنامج — التسجيل يتم بكود تصدره الإدارة فقط
async function showPairing(_device, note) {
  stopSession();
  try { localStorage.removeItem(STORE); } catch {}
  if (pairTimer) { clearInterval(pairTimer); pairTimer = null; }
  if (pairingEl) pairingEl.style.display = "none";
  runningEl.style.display = "none";
  consentEl.style.display = "flex";
  if (consentNoteEl) consentNoteEl.textContent = note || "اطلب كود تسجيل جديد من الإدارة";
  if (approveBtn) approveBtn.disabled = false;
}


async function run(device) {
  if (running) return;
  running = true;
  // إظهار شاشة "جارٍ الاتصال" فوراً قبل أي await خارجي، حتى لو IPC/شبكة
  // تأخرت لا تفضل النافذة فاضية (كان هذا سبب ظهور نافذة بيضاء والأدمن يراه غير متصل).
  consentEl.style.display = "none";
  pairingEl.style.display = "none";
  runningEl.style.display = "flex";
  deviceEl.textContent = `${device.employee_name || "موظف"} · ${device.device_id.slice(0, 8)}`;
  setStatus("جارٍ الاتصال بالسيرفر…", false);

  try {
    await Promise.race([
      window.agent?.enableAutoLaunch?.() ?? Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch { /* لا يوقف التشغيل */ }

  const first = await heartbeat(device);
  if (first === false) {
    // الإدارة حذفت الجهاز — نطلب مفتاح ربط جديد
    return showPairing(device, "تم حذف تسجيل هذا الجهاز — اطلب كود تسجيل جديد من الإدارة");
  }

  // نجهّز التقاط الشاشة أثناء فتح لوحة الإدارة، فلا نضيّع عدة ثوانٍ بعد JOIN.
  // الفشل هنا لا يوقف البرنامج؛ startPeer سيعيد المحاولة عند أول مشاهدة.
  void getStream().catch(() => {});

  hbTimer = setInterval(async () => {
    const ok = await heartbeat(device);
    if (ok === false) void showPairing(device, "تم حذف تسجيل هذا الجهاز — اطلب كود تسجيل جديد من الإدارة");
  }, 20000);

  // قناة الإشارات القديمة المفتوحة أُزيلت. البرنامج يسحب فقط الطلبات
  // التي مرّت بسياسة الأدمن، مستخدماً مفتاح الجهاز السري.
  await exchangeSignals(device);
  // الطلب الطويل المتداخل كان يكوّن طابوراً من محاولات السحب. 180ms كافية
  // لاتصال سريع وتترك الشبكة والمشفّر للبث نفسه.
  signalTimer = setInterval(() => void exchangeSignals(device), 180);
  setStatus("متصل", true);
}

approveBtn.addEventListener("click", async () => {
  approveBtn.disabled = true;
  const employee_name = nameEl.value.trim();
  const enrollCode = (enrollEl?.value || "").trim().toUpperCase();
  if (!employee_name) {
    approveBtn.disabled = false;
    return alert("اكتب اسمك أولاً");
  }
  if (enrollCode.length < 6) {
    approveBtn.disabled = false;
    return alert("اكتب كود التسجيل الذي أعطته لك الإدارة");
  }
  const device = { device_id: rand(16), secret: rand(24), employee_name };
  try {
    // نطلب صلاحية الشاشة مرة واحدة هنا للتأكد أنها تعمل
    await getStream();
    await rpcFetch("agent_register", {
      p_device_id: device.device_id,
      p_secret: device.secret,
      p_employee_name: employee_name,
      p_device_label: osLabel() + " · " + (navigator.platform || ""),
      p_os: osLabel(),
      p_version: AGENT_VERSION,
      p_enroll_code: enrollCode,
    });
    saveDevice(device);
    try { await window.agent.enableAutoLaunch(); } catch {}
    await run(device);
  } catch (err) {
    approveBtn.disabled = false;
    const m = String(err?.message || err);
    alert(/invalid or used enrollment code/i.test(m) ? "كود التسجيل غير صحيح أو مستخدم بالفعل — اطلب كودًا جديدًا من الإدارة" : "فشل التسجيل: " + m);
  }
});

const existing = loadDevice();
if (existing) {
  void run(existing).catch((err) => {
    console.error("[run] failed:", err);
    // فشل مفاجئ في الإقلاع لا يترك الواجهة فاضية — نرجع لشاشة التسجيل
    consentEl.style.display = "flex";
    runningEl.style.display = "none";
    pairingEl.style.display = "none";
  });
} else {
  consentEl.style.display = "flex";
  runningEl.style.display = "none";
  pairingEl.style.display = "none";
}

// حماية إضافية: لو بعد 4 ثوانٍ ما تظهر أي شاشة لأي سبب، نُظهر شاشة التسجيل
setTimeout(() => {
  const anyVisible = [consentEl, runningEl, pairingEl].some(
    (el) => el && getComputedStyle(el).display !== "none",
  );
  if (!anyVisible) consentEl.style.display = "flex";
}, 4000);

// التحديث تديره عملية الخلفية حصراً. عدم تشغيل فاحص ثانٍ هنا يمنع تنزيل
// نفس الإصدار مجدداً عند التركيز على النافذة أو إعادة اتصال البرنامج.

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
    await window.agent.checkUpdate?.();
    await softReconnect();
  } finally {
    setTimeout(() => btn.classList.remove("spin"), 600);
  }
});

// إعادة الاتصال تلقائياً لما الشبكة ترجع (بعد قفل اللابتوب/فقد النت)
window.addEventListener("online", () => {
  setTimeout(() => void softReconnect(), 1500);
});

