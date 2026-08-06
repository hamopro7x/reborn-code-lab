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
  opts?: { raw?: boolean; viewerId?: string },
) {
  const deviceId = opts?.raw ? code : code.trim().toUpperCase();
  const seen = new Set<string>();
  const emit = (id: string | undefined, payload: Signal | undefined) => {
    if (!payload) return;
    if (id) {
      if (seen.has(id)) return;
      seen.add(id);
      if (seen.size > 400) seen.clear();
    }
    onSignal(payload);
  };

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
        const record = row as { id?: string; sender?: string; viewer_id?: string; payload?: Signal };
        if (record.sender !== "host") return;
        if (opts?.viewerId && record.viewer_id && record.viewer_id !== opts.viewerId) return;
        emit(record.id, record.payload);
      },
    );
  // Realtime مجرد مسار سريع، وليس شرطاً لبدء الاتصال. عند فتح شاشات كثيرة
  // قد يتأخر اشتراك بعض القنوات أو يصل TIMED_OUT، بينما إدخال/قراءة الإشارات
  // من الجدول يظل يعمل. ربط send() بالاشتراك كان يجعل بعض الأجهزة فقط تظل
  // على «جاري الاتصال» إلى الأبد بدون أن يصلها join أصلاً.
  const ready = new Promise<void>((resolve) => {
    const fallback = setTimeout(resolve, 1200);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(fallback);
        resolve();
      }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(fallback);
        resolve();
      }
    });
  });

  // احتياطي: استعلام دوري مباشر — لا نعتمد فقط على الزمن الحقيقي.
  // مع وجود عدة أجهزة موظفين قد تتأخر رسائل الزمن الحقيقي فتبقى بعض
  // الشاشات في «جاري الاتصال…» بلا سبب. هذا الاستعلام يضمن وصول العرض.
  let polling = false;
  const poll = async () => {
    if (polling) return;
    polling = true;
    try {
      let q = supabase
        .from("screenshare_signals")
        .select("id,viewer_id,payload")
        .eq("device_id", deviceId)
        .eq("sender", "host")
        .order("created_at", { ascending: true })
        .limit(30);
      if (opts?.viewerId) q = q.eq("viewer_id", opts.viewerId);
      const { data } = await q;
      for (const row of data ?? []) {
        emit((row as any).id as string, (row as any).payload as Signal);
      }
    } catch {
      /* تجاهل */
    } finally {
      polling = false;
    }
  };
  const pollTimer = setInterval(() => void poll(), 400);
  void poll();

  return {
    ready,
    send: async (s: Signal) => {
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
      clearInterval(pollTimer);
      supabase.removeChannel(channel);
    },
  };
}

