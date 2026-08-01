// WebRTC screen sharing over Supabase Realtime broadcast signaling.
// Host = employee (shares screen), Viewer = admin (watches inside the panel).

import { supabase } from "@/integrations/supabase/client";

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function channelName(code: string) {
  return `screenshare-${code.trim().toUpperCase()}`;
}

export function makeCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export type Signal =
  | { type: "join" }
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from: "host" | "viewer"; candidate: RTCIceCandidateInit }
  | { type: "bye" };

export function openSignaling(
  code: string,
  onSignal: (s: Signal) => void,
  opts?: { raw?: boolean },
) {
  const name = opts?.raw ? `screenshare-${code}` : channelName(code);
  const channel = supabase.channel(name, {
    config: { broadcast: { self: false } },
  });

  channel.on("broadcast", { event: "signal" }, ({ payload }) => onSignal(payload as Signal));
  const ready = new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        reject(new Error(`signaling ${status}`));
      }
    });
  });
  // لا نترك الوعد بدون معالج (يمنع unhandled rejection في المتصفح)
  ready.catch(() => {});

  return {
    ready,
    send: async (s: Signal) => {
      await ready;
      await channel.send({ type: "broadcast", event: "signal", payload: s });
    },
    close: () => {
      supabase.removeChannel(channel);
    },
  };
}
