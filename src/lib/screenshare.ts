// WebRTC screen sharing with database-backed, admin-authorized signaling.
// Host = employee (shares screen), Viewer = admin (watches inside the panel).

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // مُرحّل بديل: يمنع فشل/بطء الاتصال على الشبكات المقيّدة
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
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  iceCandidatePoolSize: 4,
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
  | { type: "join"; viewer?: string }
  | { type: "offer"; sdp: RTCSessionDescriptionInit; to?: string }
  | { type: "answer"; sdp: RTCSessionDescriptionInit; viewer?: string }
  | { type: "ice"; from: "host" | "viewer"; candidate: RTCIceCandidateInit; viewer?: string; to?: string }
  | { type: "bye"; viewer?: string };

export function makeViewerId(): string {
  return (
    globalThis.crypto?.randomUUID?.().slice(0, 12) ??
    Math.random().toString(36).slice(2, 14)
  );
}


export function openSignaling(
  code: string,
  onSignal: (s: Signal) => void,
  opts?: { raw?: boolean },
) {
  const deviceId = opts?.raw ? code : code.trim().toUpperCase();
  const channel = supabase
    .channel(`admin-screenshare-${makeViewerId()}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "screenshare_signals",
        filter: `device_id=eq.${deviceId}`,
      },
      ({ new: row }) => {
        const record = row as { sender?: string; payload?: Signal };
        if (record.sender === "host" && record.payload) onSignal(record.payload);
      },
    );
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
      const viewerId = "viewer" in s ? s.viewer : "to" in s ? s.to : undefined;
      if (!viewerId) throw new Error("Missing viewer identity");
      const { error } = await supabase.from("screenshare_signals").insert({
        device_id: deviceId,
        viewer_id: viewerId,
        sender: "viewer",
        payload: s as unknown as Json,
      });
      if (error) throw error;
    },
    close: () => {
      supabase.removeChannel(channel);
    },
  };
}
