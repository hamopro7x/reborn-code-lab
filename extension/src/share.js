import { createClient } from "@supabase/supabase-js";

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
const previewEl = document.getElementById("preview");

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function setStatus(text, on) {
  statusEl.textContent = text;
  dotEl.classList.toggle("on", !!on);
}

let code = "------";
let stream = null;
let channel = null;
let pc = null;

async function loadCode() {
  const saved = await chrome.storage.local.get("agentCode");
  code = saved.agentCode || makeCode();
  await chrome.storage.local.set({ agentCode: code });
  codeEl.textContent = code;
}

function send(signal) {
  return channel.send({ type: "broadcast", event: "signal", payload: signal });
}

async function startPeer() {
  pc?.close();
  pc = new RTCPeerConnection(RTC_CONFIG);
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  pc.onicecandidate = (e) => {
    if (e.candidate) send({ type: "ice", from: "host", candidate: e.candidate.toJSON() });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") setStatus("المدير يشاهد شاشتك الآن", true);
    else if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
      setStatus("في انتظار المدير…", true);
    }
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await send({ type: "offer", sdp: offer });
}

async function start() {
  startBtn.disabled = true;
  try {
    setStatus("جارٍ تجهيز المشاركة…", false);
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 15 },
      audio: false,
    });
    previewEl.srcObject = stream;
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      pc?.close();
      setStatus("تم إيقاف المشاركة", false);
      startBtn.disabled = false;
      startBtn.textContent = "بدء المشاركة";
    });

    channel = supabase.channel(`screenshare-${code}`, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
      const s = payload;
      if (s.type === "join") {
        await startPeer();
      } else if (s.type === "answer") {
        if (pc) await pc.setRemoteDescription(s.sdp);
      } else if (s.type === "ice" && s.from === "viewer") {
        if (pc) await pc.addIceCandidate(s.candidate).catch(() => {});
      } else if (s.type === "bye") {
        pc?.close();
        setStatus("في انتظار المدير…", true);
      }
    });
    await new Promise((resolve) => channel.subscribe((st) => st === "SUBSCRIBED" && resolve()));
    setStatus("في انتظار المدير…", true);
    startBtn.textContent = "المشاركة نشطة";
  } catch (err) {
    setStatus("خطأ: " + (err?.message || err), false);
    startBtn.disabled = false;
  }
}

startBtn.addEventListener("click", start);
void loadCode();
