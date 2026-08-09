const SUPABASE_URL = "https://shrrrgvcrevujivuyvzv.supabase.co";
const SUPABASE_KEY = "sb_publishable_nJ6QLZiRdWnK9_qtFKPZjQ_hDkY5zrz";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  iceCandidatePoolSize: 4,
};

// جلب خوادم TURN من الموقع (بيانات دخول مؤقتة). بدون TURN تفشل الشبكات المقيّدة
// (NAT متماثل / إنترنت موبايل) فيظهر الجهاز «متصل» عند الموظف و«جاري الاتصال» عند الأدمن.
let iceWarmedAt = 0;
async function warmIceServers(force) {
  if (!force && Date.now() - iceWarmedAt < 10 * 60 * 1000) return;
  try {
    const res = await fetch("https://mag-pro1.com/api/public/ice-servers", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    if (Array.isArray(json?.iceServers) && json.iceServers.length) {
      RTC_CONFIG.iceServers = json.iceServers;
      // لا نفرض TURN: نعرضه كمسار احتياطي ونترك WebRTC يختار بين المباشر
      // والمرحّل. فرض relay كان يقطع كل الأجهزة عند تعثر TURN مؤقتاً.
      RTC_CONFIG.iceTransportPolicy = "all";
      iceWarmedAt = Date.now();
    }
  } catch {
    /* نكمل بإعدادات STUN */
  }
}
void warmIceServers(true);
setInterval(() => void warmIceServers(), 10 * 60 * 1000);



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

// يبقى نفس المفتاح عمداً حتى تنتقل هوية الجهاز من Mag Pro إلى الحزمة الجديدة
// تلقائياً، بدون حذف الجهاز من لوحة الإدارة أو طلب كود تسجيل جديد.
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
  // نلتقط البكسلات الفعلية للشاشة بدون سقف 1440p. السقف السابق كان يصغّر
  // شاشات 4K قبل الترميز، لذلك يستحيل على الموقع عرض نفس جودة جهاز الموظف.
  const dpr = window.devicePixelRatio || 1;
  const rawW = Math.round((window.screen?.width || 1920) * dpr);
  const rawH = Math.round((window.screen?.height || 1080) * dpr);
  const scale = Math.min(1, 7680 / rawW, 4320 / rawH);
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
      return await tryCapture(1280, 720, 60);
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

function reportConnectedViewers() {
  let connected = 0;
  for (const entry of peers.values()) {
    if (entry.pc?.connectionState === "connected") connected += 1;
  }
  window.agent.setViewerCount?.(connected);
}

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
      try {
        await handleViewerSignal(row.payload);
      } catch (err) {
        console.error("[signal] ignored invalid signal:", err);
      }
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
    // نقبل الإجابة في أي حالة تسمح بها المواصفة، ولا نرفضها لمجرد أن حالة
    // الإشارة تأخّرت — الرفض كان يترك الشاشة معلّقة على "جاري الاتصال".
    if (entry?.pc && entry.pc.signalingState === "have-local-offer") {
      try {
        await entry.pc.setRemoteDescription(s.sdp);
      } catch (err) {
        console.error("[signal] answer rejected:", err);
        return;
      }
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
  } else if (s.type === "cmd") {
    await handleDoctorCommand(s.action);
  }
}

// ===== أوامر روبوت الإصلاح في لوحة الإدارة =====
// renew = تجديد التقاط الشاشة، reload = إعادة تشغيل خدمة البث،
// update = تنزيل آخر إصدار وتثبيته (لو التحديثات تراكمت بعد انقطاع النت).
let lastDoctorCmdAt = 0;
async function handleDoctorCommand(action) {
  const now = Date.now();
  if (now - lastDoctorCmdAt < 4000) return;
  lastDoctorCmdAt = now;
  if (action === "renew") {
    try {
      stream = null;
      await getStream();
      for (const entry of peers.values()) {
        try { entry.pc?.getSenders?.().forEach((sn) => sn.track?.kind === "video" && sn.generateKeyFrame?.()); } catch {}
      }
      await softReconnect();
    } catch {
      window.agent?.reloadRenderer?.();
    }
    return;
  }
  if (action === "reload") {
    window.agent?.reloadRenderer?.();
    return;
  }
  if (action === "update") {
    try {
      await window.agent?.checkUpdate?.();
    } catch { /* التثبيت الصامت يكمل عند التوفر */ }
    window.agent?.reloadRenderer?.();
  }
}

async function getStream() {
  if (stream && stream.getTracks().some((t) => t.readyState === "live")) return stream;
  stream = await captureScreen();
  watchCapture(stream);
  return stream;
}

let captureRecovery = null;
function watchCapture(activeStream) {
  const track = activeStream?.getVideoTracks?.()[0];
  if (!track || track.__magRecoveryAttached) return;
  track.__magRecoveryAttached = true;
  track.addEventListener("ended", () => void recoverCapture());
}

async function recoverCapture() {
  if (captureRecovery) return captureRecovery;
  captureRecovery = (async () => {
    // Windows/Electron قد ينهي مسار الالتقاط بعد السكون أو تغيير الشاشة.
    // نلتقط مساراً جديداً ونستبدله داخل كل الاتصالات بدون فصل المشاهدين.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const next = await captureScreen();
        const nextTrack = next.getVideoTracks()[0];
        if (!nextTrack) throw new Error("no video track");
        nextTrack.contentHint = "detail";
        watchCapture(next);
        const previous = stream;
        stream = next;
        await Promise.all(Array.from(peers.values()).map(async (entry) => {
          const sender = entry.pc?.getSenders?.().find((item) => item.track?.kind === "video");
          if (sender) {
            await sender.replaceTrack(nextTrack);
            try { sender.generateKeyFrame?.(); } catch {}
          }
        }));
        previous?.getTracks?.().forEach((item) => {
          if (item !== nextTrack) try { item.stop(); } catch {}
        });
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, Math.min(5000, 500 + attempt * 300)));
      }
    }
  })().finally(() => { captureRecovery = null; });
  return captureRecovery;
}

function waitForIceGathering(pc, timeoutMs = 1800) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    pc.addEventListener("icegatheringstatechange", onChange);
  });
}

// متحكّم continuity-first: يستخدم أعلى جودة تسمح بها الشبكة، لكن لا يترك
// طابور إطارات قديمة عند ضعف الإنترنت. هبوط مؤقت في الإطارات/الدقة أفضل من
// تجمّد الشاشة بالكامل، وتعود الجودة الأصلية تدريجياً بمجرد تحسن الشبكة.
function startAdaptive(entry, sender) {
  if (entry.statsTimer) clearInterval(entry.statsTimer);

  const MIN = 350_000;
  const MAX = 30_000_000;
  let target = 4_000_000;
  let lastLost = 0;
  let lastPackets = 0;
  let weakSamples = 0;
  let healthySamples = 0;
  let scale = 1;
  let fps = 60;


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
        if (r.type === "outbound-rtp" && r.kind === "video") {
          if (typeof r.packetsSent === "number") packets = r.packetsSent;
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

      const severe = rtt > 0.45 || lossRate > 0.1;
      const weak = severe || (avail > 0 && avail < target * 0.85);
      if (weak) {
        weakSamples += 1;
        healthySamples = 0;
      } else {
        healthySamples += 1;
        weakSamples = Math.max(0, weakSamples - 1);
      }
      if (avail > 0) {
        const safe = Math.max(MIN, Math.round(avail * 0.72));
        if (severe) target = Math.max(MIN, Math.min(Math.round(target * 0.65), safe));
        // لا نتجاوز السعة المتاحة. Math.max هنا سابقاً كان يختار رقماً أعلى
        // من السعة نفسها، فينشأ طابور فيديو ويصبح باقي الأجهزة "جاري الاتصال".
        else target = Math.min(MAX, safe, Math.round(target * 1.12 + 250_000));
      } else if (severe) {
        target = Math.round(target * 0.6);
      } else {
        target = Math.round(target * 1.08 + 150_000);
      }
      target = Math.max(MIN, Math.min(MAX, target));

      // لا نغيّر الجودة بسبب تذبذب لحظي. بعد 3 عينات ضعيفة نقلل الحمل، وبعد
      // 8 عينات سليمة نعيد الجودة خطوة بخطوة حتى الدقة الأصلية و60fps.
      if (weakSamples >= 3) {
        if (target < 700_000) { scale = 3; fps = 12; }
        else if (target < 1_500_000) { scale = 2; fps = 20; }
        else if (target < 3_000_000) { scale = 1.5; fps = 30; }
        weakSamples = 0;
      } else if (healthySamples >= 8) {
        if (scale > 2) scale = 2;
        else if (scale > 1.5) scale = 1.5;
        else scale = 1;
        fps = scale === 1 ? 60 : scale === 1.5 ? 30 : 20;
        healthySamples = 0;
      }

      const params = sender.getParameters();
      if (params.encodings?.[0]) {
        params.degradationPreference = "balanced";
        params.encodings[0].maxBitrate = target;
        params.encodings[0].maxFramerate = fps;
        params.encodings[0].scaleResolutionDownBy = scale;
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
  if (entry.connectTimer) clearTimeout(entry.connectTimer);
  try { entry.pc.close(); } catch {}
  // مسار الشاشة مشترك بين كل المشاهدين — لا نوقفه هنا

  peers.delete(viewerId);
  reportConnectedViewers();
  setStatus("متصل", true);
}

async function restartPeerIce(entry) {
  if (!entry?.pc || entry.restartingIce) return;
  if (entry.pc.signalingState !== "stable") {
    if (!entry.recoverTimer) {
      entry.recoverTimer = setTimeout(() => {
        entry.recoverTimer = null;
        if (entry.pc?.connectionState !== "connected") void restartPeerIce(entry);
      }, 1500);
    }
    return;
  }
  entry.restartingIce = true;
  try {
    const offer = await entry.pc.createOffer({ iceRestart: true });
    await entry.pc.setLocalDescription(offer);
    await waitForIceGathering(entry.pc, 2200);
    const completeOffer = entry.pc.localDescription;
    if (!completeOffer) return;
    entry.offer = { type: completeOffer.type, sdp: completeOffer.sdp };
    await send({ type: "offer", to: entry.viewerId, sdp: entry.offer });
  } catch {
    /* المشاهد سيعيد JOIN لو تعذر إصلاح المسار الحالي */
  } finally {
    entry.restartingIce = false;
  }
}

const startingViewers = new Set();

async function startPeer(viewerId) {
  if (startingViewers.has(viewerId)) return; // منع بدء اتصالين لنفس المشاهد
  // تنظيف المصافحات القديمة التي تركتها إعادة تحميل لوحة الإدارة. بقاؤها
  // كان يشغّل عدة مشفّرات لنفس الشاشة ويمنع الجلسة الجديدة من الاستجابة.
  const now = Date.now();
  for (const [oldViewerId, oldEntry] of peers) {
    if (
      oldViewerId !== viewerId &&
      oldEntry.pc?.connectionState !== "connected" &&
      now - (oldEntry.startedAt ?? 0) > 20_000
    ) {
      closePeer(oldViewerId);
    }
  }
  const current = peers.get(viewerId);
  if (current?.pc && ["new", "connecting", "connected"].includes(current.pc.connectionState)) {
    if (current.pc.connectionState === "connected") return;
    const age = Date.now() - (current.startedAt ?? 0);
    // JOIN يُعاد كثيراً كضمان لوصول الإشارة. لا نهدم الاتصال الجاري بسبب
    // رسالة JOIN مكررة؛ على الشبكات الضعيفة قد يستغرق TURN أكثر من 15 ثانية.
    if (age < 30_000 && current.pc.signalingState === "have-local-offer") {
      if (current.offer) await send({ type: "offer", to: viewerId, sdp: current.offer });
      return;
    }
    if (age < 30_000) return;
  }
  startingViewers.add(viewerId);
  try {
    await warmIceServers();
    closePeer(viewerId); // أي اتصال قديم لنفس المشاهد يُستبدل
    const s = await getStream();
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const entry = { viewerId, pc, statsTimer: null, pendingIce: [], recoverTimer: null, connectTimer: null, offer: null, startedAt: Date.now(), restartingIce: false };

    peers.set(viewerId, entry);
    reportConnectedViewers();

    // نستخدم مسار الشاشة الأصلي نفسه لكل مشاهد. كل اتصال (PeerConnection)
    // له مشفّر مستقل أصلاً، أما نسخ المسار (clone) في Electron كان يتوقف عن
    // إنتاج إطارات بعد فترة فتتجمّد الصورة عند الأدمن بينما الحالة "متصل".
    const track = s.getVideoTracks()[0];
    if (!track) throw new Error("لا يوجد مسار فيديو");
    // detail يجعل مشفّر WebRTC يحافظ على حدة النصوص وحدود واجهة ويندوز بدلاً
    // من تنعيم الصورة كما يفعل وضع motion المخصص للفيديو والكاميرات.
    track.contentHint = "detail";
    pc.addTrack(track, s);


    // ===== قناة التحكم عن بعد: الأدمن يرسل أوامر الماوس والكيبورد =====
    try {
      const ctl = pc.createDataChannel("ctl", {
        ordered: false,
        maxRetransmits: 0,
      });
      entry.ctl = ctl;
      ctl.onmessage = (ev) => {
        try {
          const cmd = JSON.parse(ev.data);
          window.agent?.remoteInput?.(cmd);
        } catch {
          /* أمر تالف */
        }
      };
    } catch {
      /* بعض النسخ لا تدعم قنوات البيانات */
    }

    let videoSender = null;
    for (const sender of pc.getSenders()) {
      if (!sender.track || sender.track.kind !== "video") continue;
      videoSender = sender;
      try {
        const params = sender.getParameters();
        // نبدأ بجودة عالية ثم نكيف الحمل سريعاً قبل أن يتكون طابور frames قديم.
        params.degradationPreference = "balanced";
        params.encodings = [
          {
            ...(params.encodings?.[0] ?? {}),
            // إرسال أول إطار بالجودة الكاملة ثم التكيف حسب الشبكة.
            maxBitrate: 4_000_000,
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
      if (e.candidate)
        void send({ type: "ice", from: "host", to: viewerId, candidate: e.candidate.toJSON() }).catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        if (entry.connectTimer) { clearTimeout(entry.connectTimer); entry.connectTimer = null; }
        if (entry.recoverTimer) { clearTimeout(entry.recoverTimer); entry.recoverTimer = null; }
        setStatus("متصل", true);
        reportConnectedViewers();
        // رشقة إطارات مفتاحية في أول ثوانٍ: تظهر الصورة فوراً ولا تبقى
        // متجمّدة لو ضاع أول keyframe في الشبكة.
        let kf = 0;
        const kfTimer = setInterval(() => {
          if (++kf > 6 || pc.connectionState !== "connected") return clearInterval(kfTimer);
          try { videoSender?.generateKeyFrame?.(); } catch {}
        }, 700);
        try { videoSender?.generateKeyFrame?.(); } catch {}

      }
      // انقطاع مؤقت للشبكة: نحاول إصلاح مسار ICE بدل قطع البث فوراً
      if (pc.connectionState === "disconnected") {
        // امنح WebRTC لحظة قصيرة لمعالجة فقد الحزم؛ ICE restart الفوري عند
        // كل تذبذب كان يضاعف الحمل على الشبكات الضعيفة ويقطع الصورة.
        if (!entry.recoverTimer) {
          entry.recoverTimer = setTimeout(() => {
            entry.recoverTimer = null;
            if (pc.connectionState !== "connected") {
              void restartPeerIce(entry).finally(() => {
                if (pc.connectionState === "disconnected" && !entry.recoverTimer) {
                  entry.recoverTimer = setTimeout(() => {
                    entry.recoverTimer = null;
                    if (pc.connectionState !== "connected") void restartPeerIce(entry);
                  }, 5000);
                }
              });
            }
          }, 10_000);
        }
        return;
      }
      if (["failed", "closed"].includes(pc.connectionState)) {
        closePeer(viewerId);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // ننتظر تجميع المرشحين ونضمّنهم داخل SDP نفسه. هذا يمنع ضياع مرشحي ICE
    // المنفصلين عند فتح أربع شاشات في وقت واحد، خصوصاً على شبكات الموظفين
    // المختلفة أو المقيدة.
    await waitForIceGathering(pc);
    const completeOffer = pc.localDescription;
    if (!completeOffer) throw new Error("تعذّر إنشاء عرض الاتصال");
    entry.offer = { type: completeOffer.type, sdp: completeOffer.sdp };
    await send({ type: "offer", to: viewerId, sdp: entry.offer });
    entry.connectTimer = setTimeout(() => {
      entry.connectTimer = null;
      if (pc.connectionState !== "connected") closePeer(viewerId);
    }, 60_000);
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
let heartbeatFailures = 0;

// نبض داخلي للعملية الرئيسية لا يعتمد على الشبكة. إذا توقف JavaScript لأي
// سبب تكتشفه عملية Electron الرئيسية وتعيد تشغيل خدمة البث تلقائياً.
window.agent?.rendererPulse?.();
setInterval(() => window.agent?.rendererPulse?.(), 5_000);

async function refreshHeartbeat(device) {
  const ok = await heartbeat(device);
  if (ok === true) {
    heartbeatFailures = 0;
    setStatus("متصل", true);
    return;
  }
  if (ok === false) {
    void showPairing(device, "تم حذف تسجيل هذا الجهاز — اطلب كود تسجيل جديد من الإدارة");
    return;
  }
  heartbeatFailures += 1;
  setStatus("انقطع الاتصال — جاري الاستعادة…", false);
  // فشل نبض قاعدة البيانات لا يعني أن مسار WebRTC متوقف؛ لا نهدم بثاً حياً
  // بسبب طلب HTTP بطيء. دورة النبض والإشارات ستتعافى تلقائياً.
}

function stopSession() {
  running = false;
  if (hbTimer) clearInterval(hbTimer);
  hbTimer = null;
  if (signalTimer) clearInterval(signalTimer);
  signalTimer = null;
  for (const id of Array.from(peers.keys())) closePeer(id);
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
  if (first === true) {
    heartbeatFailures = 0;
  } else {
    heartbeatFailures = 1;
    setStatus("انقطع الاتصال — جاري الاستعادة…", false);
  }

  // نجهّز التقاط الشاشة أثناء فتح لوحة الإدارة، فلا نضيّع عدة ثوانٍ بعد JOIN.
  // الفشل هنا لا يوقف البرنامج؛ startPeer سيعيد المحاولة عند أول مشاهدة.
  void getStream().catch(() => {});

  hbTimer = setInterval(() => void refreshHeartbeat(device), 10_000);

  // قناة الإشارات القديمة المفتوحة أُزيلت. البرنامج يسحب فقط الطلبات
  // التي مرّت بسياسة الأدمن، مستخدماً مفتاح الجهاز السري.
  await exchangeSignals(device);
  // دورة مستقرة موزعة زمنياً: تكفي لاتصال سريع، وتمنع تزامن كل الأجهزة على
  // قاعدة الإشارات في اللحظة نفسها. كل طلب له مهلة ولا تتداخل الطلبات.
  signalTimer = setInterval(() => void exchangeSignals(device), 900 + Math.floor(Math.random() * 350));
  if (first === true) setStatus("متصل", true);
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
let reconnectRequestTimer = null;
async function softReconnect() {
  if (reconnecting) return;
  const d = loadDevice();
  if (!d) return;
  reconnecting = true;
  try {
    if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    if (signalTimer) { clearInterval(signalTimer); signalTimer = null; }
    channel = null;
    running = false; // ملاحظة: لا نلمس pc/stream إطلاقاً حتى لا ينقطع البث
    await run(d);
  } finally {
    reconnecting = false;
  }
}

function requestReconnect(delay = 1500) {
  if (reconnectRequestTimer || reconnecting) return;
  reconnectRequestTimer = setTimeout(() => {
    reconnectRequestTimer = null;
    void softReconnect();
  }, delay);
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
  requestReconnect(1500);
});

window.agent.onPowerResume?.(() => {
  setStatus("جارٍ استعادة الاتصال…", false);
  requestReconnect(2500);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[renderer] unhandled rejection:", event.reason);
});

// ============ حارس التحديث الذاتي ============
// السبب: مسار التقاط الشاشة على ويندوز أحياناً «ينسدّ» بدون حدث ended
// (الشاشة تظل «متصل» عند الأدمن لكن الفيديو متجمّد). نراقب حالة المسار
// وحجم البايتات المرسلة، ولو ثبتت لفترة نجدّد الالتقاط والاتصال تلقائياً.
let lastCaptureRefresh = Date.now();
async function ensureFreshCapture(reason) {
  try {
    console.warn("[watchdog] refreshing capture:", reason);
    await recoverCapture();
    for (const entry of peers.values()) {
      try { entry.pc.getSenders().forEach((s) => s.track?.kind === "video" && s.generateKeyFrame?.()); } catch {}
    }
    lastCaptureRefresh = Date.now();
  } catch (err) {
    console.error("[watchdog] capture refresh failed:", err);
  }
}

setInterval(() => {
  if (!running) return;
  const track = stream?.getVideoTracks?.()[0];
  // مسار منتهي/مكتوم لأكثر من ثانيتين => نجدّده
  if (!track || track.readyState === "ended") {
    void ensureFreshCapture("track ended");
    return;
  }
  if (track.muted) {
    void ensureFreshCapture("track muted");
    return;
  }
}, 15_000);

// إعادة اتصال ناعم دوري كل 5 دقائق: يعيد جلب TURN ويجدد قناة الإشارات
// بدون إعادة تحميل الصفحة، فيبقى البث حياً حتى في حالات الأخطاء الصامتة.
setInterval(() => {
  if (!running) return;
  void warmIceServers(true);
  // تجديد بيانات TURN لا يستلزم هدم قناة الإشارات أو لمس بث حي.
}, 5 * 60 * 1000);

// تنظيف المصافحات الميتة مستقلاً عن وصول JOIN جديد. لا نحتفظ باتصال شبح
// يستهلك المشفر أو يمنع تثبيت تحديث جاهز.
setInterval(() => {
  const now = Date.now();
  for (const [viewerId, entry] of peers) {
    if (entry.pc?.connectionState !== "connected" && now - (entry.startedAt || 0) > 75_000) {
      closePeer(viewerId);
    }
  }
  reportConnectedViewers();
}, 15_000);

// مراقبة خفيفة لا تهدم الواجهة: سطح المكتب الثابت قد لا ينتج بايتات جديدة،
// لذلك نصلح فقط الاتصالات التي دخلت حالة فشل حقيقية.
let lastAnyBytes = { total: 0, at: Date.now() };
setInterval(async () => {
  if (!running || peers.size === 0) { lastAnyBytes.at = Date.now(); return; }
  let total = 0;
  for (const entry of peers.values()) {
    try {
      const stats = await entry.pc.getStats();
      stats.forEach((r) => { if (r.type === "outbound-rtp" && r.kind === "video") total += (r.bytesSent || 0); });
    } catch {}
  }
  if (total > lastAnyBytes.total) {
    lastAnyBytes = { total, at: Date.now() };
    return;
  }
  if (Date.now() - lastAnyBytes.at > 90_000) {
    for (const entry of peers.values()) {
      if (entry.pc?.connectionState === "disconnected") void restartPeerIce(entry);
      else if (["failed", "closed"].includes(entry.pc?.connectionState)) closePeer(entry.viewerId);
    }
    lastAnyBytes.at = Date.now();
  }
}, 20_000);


