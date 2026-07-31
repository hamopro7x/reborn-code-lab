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

const codeEl = document.getElementById("code");
const statusEl = document.getElementById("status");
const dotEl = document.getElementById("dot");
const startBtn = document.getElementById("start");

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

let code = localStorage.getItem("agent-code");
if (!code) {
  code = makeCode();
  localStorage.setItem("agent-code", code);
}
codeEl.textContent = code;

let stream = null;
let channel = null;
const peers = new Map();

function setStatus(text, on) {
  statusEl.textContent = text;
  dotEl.classList.toggle("on", !!on);
}

async function captureScreen() {
  const sourceId = await window.agent.getScreenSource();
  if (!sourceId) throw new Error("لا توجد شاشة متاحة");
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 15,
      },
    },
  });
}

function send(signal) {
  return channel.send({ type: "broadcast", event: "signal", payload: signal });
}

async function startPeer() {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  peers.set("viewer", pc);
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  pc.onicecandidate = (e) => {
    if (e.candidate) send({ type: "ice", from: "host", candidate: e.candidate.toJSON() });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") setStatus("المدير يشاهد الشاشة الآن", true);
    if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
      setStatus("في انتظار المدير…", true);
    }
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await send({ type: "offer", sdp: offer });
  return pc;
}

async function start() {
  startBtn.disabled = true;
  try {
    setStatus("جارٍ تجهيز المشاركة…", false);
    stream = await captureScreen();
    channel = supabase.channel(`screenshare-${code}`, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
      const s = payload;
      if (s.type === "join") {
        peers.get("viewer")?.close();
        peers.delete("viewer");
        await startPeer();
      } else if (s.type === "answer") {
        const pc = peers.get("viewer");
        if (pc) await pc.setRemoteDescription(s.sdp);
      } else if (s.type === "ice" && s.from === "viewer") {
        const pc = peers.get("viewer");
        if (pc) await pc.addIceCandidate(s.candidate).catch(() => {});
      } else if (s.type === "bye") {
        peers.get("viewer")?.close();
        peers.delete("viewer");
        setStatus("في انتظار المدير…", true);
      }
    });
    await new Promise((resolve) =>
      channel.subscribe((st) => st === "SUBSCRIBED" && resolve()),
    );
    setStatus("في انتظار المدير…", true);
    startBtn.textContent = "المشاركة نشطة";
  } catch (err) {
    setStatus("خطأ: " + (err?.message || err), false);
    startBtn.disabled = false;
  }
}

startBtn.addEventListener("click", start);
// auto-start on launch
start();
