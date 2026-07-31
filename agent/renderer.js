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
const AGENT_VERSION = "1.6.0";


const updateEl = document.getElementById("update");
const updVerEl = document.getElementById("upd-ver");
const updNotesEl = document.getElementById("upd-notes");
const updBtn = document.getElementById("upd-btn");
const updBar = document.getElementById("upd-bar");
const updFill = document.getElementById("upd-fill");
const updProg = document.getElementById("upd-progress");
const updLater = document.getElementById("upd-later");

const mb = (n) => (n / 1048576).toFixed(1) + " MB";

window.agent.onUpdateProgress?.(({ received, total, percent }) => {
  updBar.style.display = "block";
  if (percent != null) {
    updFill.style.width = percent + "%";
    updProg.textContent = `جارٍ التحميل… ${percent}% (${mb(received)} / ${mb(total)})`;
  } else {
    updFill.style.width = "100%";
    updProg.textContent = `جارٍ التحميل… ${mb(received)}`;
  }
});

async function startDownload(info) {
  if (!info?.url) return;
  updateBusy = true;
  updBtn.disabled = true;
  updBtn.textContent = "جارٍ التحميل…";
  updBar.style.display = "block";
  updFill.style.width = "0%";
  updProg.textContent = "جارٍ بدء التحميل…";
  try {
    await window.agent.downloadUpdate(info.url);
    updFill.style.width = "100%";
    updProg.textContent = "تم التحميل — جاهز للتثبيت";
    updBtn.textContent = "تثبيت";
    updBtn.disabled = false;
    updBtn.onclick = async () => {
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
  } catch (err) {
    updProg.textContent = "فشل التحميل: " + (err?.message || err);
    updBtn.textContent = "إعادة المحاولة";
    updBtn.disabled = false;
    updBtn.onclick = () => startDownload(info);
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
    updNotesEl.textContent = info.notes || "نسخة أحدث متاحة للتحميل";
    updBtn.textContent = "تحميل التحديث";
    updBtn.disabled = false;
    updBtn.onclick = () => startDownload(info);
    updLater.style.display = "inline-block";
    updLater.onclick = () => {
      dismissedVersion = info.version;
      updateEl.style.display = "none";
    };
    updateEl.style.display = "flex";
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
  // جودة عالية جداً (حتى 4K/8K حسب دقة شاشة الجهاز) مع معدل إطارات عالي
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          maxWidth: 7680,
          maxHeight: 4320,
          maxFrameRate: 60,
        },
      },
    });
  } catch {
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          maxWidth: 3840,
          maxHeight: 2160,
          maxFrameRate: 60,
        },
      },
    });
  }
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

async function startPeer() {
  pc?.close();
  const s = await getStream();
  pc = new RTCPeerConnection(RTC_CONFIG);
  pc.getConfiguration?.();
  s.getVideoTracks().forEach((t) => {
    t.contentHint = "motion";
  });
  s.getTracks().forEach((t) => pc.addTrack(t, s));

  // جودة عالية + كمون منخفض: نحافظ على الدقة والإطارات معاً مع بت-ريت مرتفع
  for (const sender of pc.getSenders()) {
    if (!sender.track || sender.track.kind !== "video") continue;
    try {
      const params = sender.getParameters();
      params.degradationPreference = "balanced";
      params.encodings = [
        {
          ...(params.encodings?.[0] ?? {}),
          maxBitrate: 40_000_000,
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
    if (pc.connectionState === "connected") setStatus("المدير يشاهد الشاشة الآن", true);
    if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
      setStatus("متصل — في انتظار طلب المشاهدة", true);
    }
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await send({ type: "offer", sdp: offer });
}

async function heartbeat(device) {
  try {
    const { data } = await supabase.rpc("agent_heartbeat", {
      p_device_id: device.device_id,
      p_secret: device.secret,
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
async function requestPairing(device) {
  const { data, error } = await supabase.rpc("agent_pair_request", {
    p_device_id: device.device_id,
    p_secret: device.secret,
    p_employee_name: device.employee_name || null,
    p_device_label: osLabel() + " · " + (navigator.platform || ""),
    p_os: osLabel(),
  });
  if (error) throw error;
  return data;
}

async function showPairing(device, note) {
  stopSession();
  consentEl.style.display = "none";
  runningEl.style.display = "none";
  pairingEl.style.display = "flex";
  pairStatusEl.textContent = note || "في انتظار موافقة الإدارة…";

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
      pairCodeEl.textContent = code;
      pairStatusEl.textContent = "في انتظار موافقة الإدارة…";
    } catch (err) {
      pairStatusEl.textContent = "تعذّر الاتصال بالسيرفر — إعادة المحاولة…";
    }
  };

  await tick();
  if (!pairTimer) pairTimer = setInterval(() => void tick(), 5000);
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
  if (!updTimer) updTimer = setInterval(() => void checkUpdate(), 30 * 60 * 1000);

  channel = supabase.channel(`screenshare-${device.device_id}`, {
    config: { broadcast: { self: false } },
  });
  channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
    const s = payload;
    try {
      if (s.type === "join") {
        await startPeer();
      } else if (s.type === "answer") {
        if (pc) await pc.setRemoteDescription(s.sdp);
      } else if (s.type === "ice" && s.from === "viewer") {
        if (pc) await pc.addIceCandidate(s.candidate).catch(() => {});
      } else if (s.type === "bye") {
        pc?.close();
        pc = null;
        setStatus("متصل — في انتظار طلب المشاهدة", true);
      }
    } catch (err) {
      setStatus("خطأ: " + (err?.message || err), false);
    }
  });
  await new Promise((resolve) => channel.subscribe((st) => st === "SUBSCRIBED" && resolve()));
  setStatus("متصل — في انتظار طلب المشاهدة", true);
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

// إعادة الاتصال تلقائياً لما الشبكة ترجع (بعد قفل اللابتوب/فقد النت)
window.addEventListener("online", () => {
  setTimeout(() => window.location.reload(), 1500);
});
