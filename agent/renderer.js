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
const AGENT_VERSION = "1.8.13";

const verBadgeEl = document.getElementById("ver-badge");
if (verBadgeEl) verBadgeEl.textContent = "v" + AGENT_VERSION;




const updateEl = document.getElementById("update");
const updVerEl = document.getElementById("upd-ver");
const updBtn = document.getElementById("upd-btn");
const updBar = document.getElementById("upd-bar");
const updFill = document.getElementById("upd-fill");
const updProg = document.getElementById("upd-progress");
const updLater = document.getElementById("upd-later");

const mb = (n) => (n / 1048576).toFixed(1) + " MB";

// التحديث صامت — نتجاهل مؤشر التقدم ولا نعرض شيئاً للموظف
window.agent.onUpdateProgress?.(() => {});

async function startDownload(info, autoInstall = false) {
  if (!info?.url) return;
  if (updateBusy) return; // منع تحميل ثانٍ متزامن على نفس الملف
  updateBusy = true;
  // تحديث صامت: لا نظهر أي شيء للموظف
  updateEl.style.display = "none";
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
  // 1080p هو أفضل نقطة لحدة النصوص مع ترميز فوري بزمن وصول منخفض.
  // 1440p/4K مع 60fps يضغطان المشفّر والشبكة ويكوّنان طابور إرسال متأخر.
  const dpr = window.devicePixelRatio || 1;
  const rawW = Math.round((window.screen?.width || 1920) * dpr);
  const rawH = Math.round((window.screen?.height || 1080) * dpr);
  const scale = Math.min(1, 1920 / rawW, 1080 / rawH);
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


// نُفضّل H264 (يعطي وضوح أفضل للنصوص عند نفس البت-ريت) ثم VP9 ثم VP8.
function preferCodec(pc) {
  try {
    const caps = RTCRtpSender.getCapabilities?.("video");
    if (!caps) return;
    const order = ["video/H264", "video/VP9", "video/AV1", "video/VP8"];
    const rank = (mimeType) => {
      const index = order.indexOf(mimeType);
      return index === -1 ? order.length : index;
    };
    const sorted = [...caps.codecs].sort((a, b) => rank(a.mimeType) - rank(b.mimeType));
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
        // بداية واضحة بدون ملء طابور الشبكة، مع سقف مناسب لـ1080p/30.
        ";x-google-start-bitrate=3500;x-google-min-bitrate=500;x-google-max-bitrate=8000";
    }
  }
  // b=AS بعد سطر c= الخاص بالفيديو
  const res = [];
  let seenVideo = false;
  for (const line of out) {
    if (line.startsWith("m=")) seenVideo = line.startsWith("m=video");
    res.push(line);
    if (seenVideo && line.startsWith("c=")) res.push("b=AS:8000", "b=TIAS:8000000");

  }
  return res.join("\r\n");
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

// متحكّم latency-first: لا نستهلك كل الباندويث المتاح حتى لا يتراكم طابور إرسال.
// نهبط فوراً عند الازدحام ونصعد ببطء بعد استقرار الشبكة.
function startAdaptive(entry, sender) {
  if (entry.statsTimer) clearInterval(entry.statsTimer);

  const MIN = 450_000;
  const MAX = 8_000_000;
  let target = 3_500_000;
  let scale = 1;
  let lastLost = 0;
  let lastPackets = 0;
  let lastBytes = 0;
  let lastTimestamp = 0;
  entry.statsTimer = setInterval(async () => {
    if (!entry.pc || entry.pc.connectionState !== "connected") return;
    try {
      const stats = await sender.getStats();
      let rtt = 0;
      let lost = 0;
      let packets = 0;
      let bytes = 0;
      let avail = 0;
      let qualityLimited = "";
      stats.forEach((r) => {
        if (r.type === "remote-inbound-rtp") {
          if (typeof r.roundTripTime === "number") rtt = r.roundTripTime;
          if (typeof r.packetsLost === "number") lost = r.packetsLost;
        }
        if (r.type === "candidate-pair" && r.state === "succeeded") {
          if (typeof r.availableOutgoingBitrate === "number") avail = r.availableOutgoingBitrate;
          if (typeof r.currentRoundTripTime === "number" && !rtt) rtt = r.currentRoundTripTime;
        }
        if (r.type === "outbound-rtp") {
          if (typeof r.packetsSent === "number") packets = r.packetsSent;
          if (typeof r.bytesSent === "number") bytes = r.bytesSent;
          if (typeof r.qualityLimitationReason === "string")
            qualityLimited = r.qualityLimitationReason;
        }
      });
      const dLost = Math.max(0, lost - lastLost);
      const dPackets = Math.max(1, packets - lastPackets);
      lastLost = lost;
      lastPackets = packets;
      const lossRate = dLost / dPackets;
      const now = performance.now();
      const sendRate = lastTimestamp && bytes >= lastBytes
        ? ((bytes - lastBytes) * 8000) / Math.max(1, now - lastTimestamp)
        : 0;
      lastBytes = bytes;
      lastTimestamp = now;

      // هامش 30% يمنع امتلاء bufferbloat. RTT أو الفقد يسببان خفضاً فورياً.
      const cpuLimited = qualityLimited === "cpu";
      const severe = rtt > 0.35 || lossRate > 0.06;
      const congested = severe || rtt > 0.18 || lossRate > 0.025 || qualityLimited === "bandwidth";
      if (avail > 0) {
        const safe = Math.round(avail * 0.7);
        if (severe) target = Math.min(Math.round(target * 0.62), safe);
        else if (congested) target = Math.min(Math.round(target * 0.82), safe);
        else target = Math.min(safe, Math.round(target * 1.08 + 80_000));
      } else if (congested) {
        target = Math.round(target * (severe ? 0.62 : 0.82));
      } else {
        target = Math.round(target * 1.06 + 60_000);
      }
      // لو المشفّر لا يستطيع تصريف الهدف، لا نرفع أكثر لمجرد أن التقدير النظري مرتفع.
      if (sendRate > 0 && congested) target = Math.min(target, Math.round(sendRate * 0.9));
      target = Math.max(MIN, Math.min(MAX, target));

      // نخفض الدقة قبل أن تتراكم ثوانٍ من الفيديو، ونبقي 30fps للاستجابة السريعة.
      let nextScale = scale;
      if (cpuLimited || target < 750_000) nextScale = 2;
      else if (target < 1_500_000) nextScale = 1.5;
      else nextScale = 1;

      const params = sender.getParameters();
      if (params.encodings?.[0]) {
        params.encodings[0].maxBitrate = target;
        params.encodings[0].maxFramerate = 30;
        if (nextScale !== scale) {
          params.encodings[0].scaleResolutionDownBy = nextScale;
          scale = nextScale;
        }
        await sender.setParameters(params);
      }
    } catch {
      /* تجاهل */
    }
  }, 500);
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
  setStatus(peers.size > 0 ? `متصل · ${peers.size} مشاهد` : "متصل", true);
}

const startingViewers = new Set();

async function startPeer(viewerId) {
  if (startingViewers.has(viewerId)) return; // منع بدء اتصالين لنفس المشاهد
  const current = peers.get(viewerId);
  if (current?.pc && ["new", "connecting", "connected"].includes(current.pc.connectionState)) return;
  startingViewers.add(viewerId);
  try {
    closePeer(viewerId); // أي اتصال قديم لنفس المشاهد يُستبدل
    const s = await getStream();
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const entry = { pc, statsTimer: null, pendingIce: [], recoverTimer: null };
    peers.set(viewerId, entry);

    // كل مشاهد يحصل على نسخة مستقلة من مسار الشاشة (clone) => مشفّر منفصل
    // ومعدّل بت-ريت منفصل. مشاركة نفس المسار بين اتصالين كانت تجعل
    // التكيّف (scaleResolutionDownBy/framerate) يتصارع فيتوقف البث الثاني.
    const base = s.getVideoTracks()[0];
    if (!base) throw new Error("لا يوجد مسار فيديو");
    const track = base.clone();
    track.contentHint = "detail";
    entry.track = track;
    pc.addTrack(track, new MediaStream([track]));
    preferCodec(pc);

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
            // بداية بجودة عالية (الدقة الكاملة) ثم تصحيح لأسفل فقط عند الحاجة
            maxBitrate: 3_500_000,
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
    offer.sdp = boostSdp(offer.sdp);
    await pc.setLocalDescription(offer);
    await send({ type: "offer", to: viewerId, sdp: { type: offer.type, sdp: offer.sdp } });
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
  try { await window.agent.enableAutoLaunch(); } catch {}
  consentEl.style.display = "none";
  pairingEl.style.display = "none";
  runningEl.style.display = "flex";
  deviceEl.textContent = `${device.employee_name || "موظف"} · ${device.device_id.slice(0, 8)}`;
  setStatus("جارٍ الاتصال بالسيرفر…", false);

  const first = await heartbeat(device);
  if (first === false) {
    // الإدارة حذفت الجهاز — نطلب مفتاح ربط جديد
    return showPairing(device, "تم حذف تسجيل هذا الجهاز — اطلب كود تسجيل جديد من الإدارة");
  }

  hbTimer = setInterval(async () => {
    const ok = await heartbeat(device);
    if (ok === false) void showPairing(device, "تم حذف تسجيل هذا الجهاز — اطلب كود تسجيل جديد من الإدارة");
  }, 20000);

  // قناة الإشارات القديمة المفتوحة أُزيلت. البرنامج يسحب فقط الطلبات
  // التي مرّت بسياسة الأدمن، مستخدماً مفتاح الجهاز السري.
  await exchangeSignals(device);
  signalTimer = setInterval(() => void exchangeSignals(device), 300);
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
  void run(existing);
} else {
  consentEl.style.display = "flex";
  runningEl.style.display = "none";
  pairingEl.style.display = "none";
}

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
    await softReconnect();
  } finally {
    setTimeout(() => btn.classList.remove("spin"), 600);
  }
});

// إعادة الاتصال تلقائياً لما الشبكة ترجع (بعد قفل اللابتوب/فقد النت)
window.addEventListener("online", () => {
  setTimeout(() => void softReconnect(), 1500);
});

