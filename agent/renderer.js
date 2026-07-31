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
const nameEl = document.getElementById("employee-name");
const approveBtn = document.getElementById("approve");
const statusEl = document.getElementById("status");
const dotEl = document.getElementById("dot");
const deviceEl = document.getElementById("device");

const STORE = "mag-agent-device-v1";
const AGENT_VERSION = "1.2.0";

const updateEl = document.getElementById("update");
const updVerEl = document.getElementById("upd-ver");
const updNotesEl = document.getElementById("upd-notes");
const updBtn = document.getElementById("upd-btn");

function cmpVersion(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

async function checkUpdate() {
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
    updVerEl.textContent = "v" + info.version;
    updNotesEl.textContent = info.notes || "نسخة أحدث متاحة للتحميل";
    updBtn.onclick = () => {
      if (info.url) void window.agent.openExternal(info.url);
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
    await supabase.rpc("agent_heartbeat", {
      p_device_id: device.device_id,
      p_secret: device.secret,
    });
  } catch {
    /* offline — retry next tick */
  }
}

async function run(device) {
  try { await window.agent.enableAutoLaunch(); } catch {}
  consentEl.style.display = "none";
  runningEl.style.display = "flex";
  deviceEl.textContent = `${device.employee_name || "موظف"} · ${device.device_id.slice(0, 8)}`;
  setStatus("جارٍ الاتصال بالسيرفر…", false);

  await heartbeat(device);
  setInterval(() => heartbeat(device), 20000);

  void checkUpdate();
  setInterval(() => void checkUpdate(), 30 * 60 * 1000);

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
}

// إعادة الاتصال تلقائياً لما الشبكة ترجع (بعد قفل اللابتوب/فقد النت)
window.addEventListener("online", () => {
  setTimeout(() => window.location.reload(), 1500);
});
