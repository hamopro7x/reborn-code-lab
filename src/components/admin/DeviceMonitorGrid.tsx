import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { KeyRound, Loader2, Maximize2, Minimize2, Monitor, RefreshCw, Trash2 } from "lucide-react";

import { RTC_CONFIG, openSignaling, type Signal } from "@/lib/screenshare";

type Device = {
  id: string;
  device_id: string;
  employee_name: string | null;
  device_label: string | null;
  os: string | null;
  approved: boolean;
  last_seen_at: string | null;
  created_at: string;
};

const isOnline = (d: Device) =>
  !!d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < 60_000;

/** يفتح بثاً مباشراً للجهاز تلقائياً طالما enabled = true (زي كاميرات المراقبة) */
function useDeviceStream(deviceId: string, enabled: boolean) {
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLive(false);
      setFailed(false);
      return;
    }
    let closed = false;
    setLive(false);
    setFailed(false);
    const pc = new RTCPeerConnection(RTC_CONFIG);

    // نُفضّل H264 ثم VP9 للمشاهدة (وضوح أفضل للنصوص)
    try {
      const caps = (
        RTCRtpReceiver as unknown as {
          getCapabilities?: (k: string) => { codecs: Array<{ mimeType: string }> } | null;
        }
      ).getCapabilities?.("video");
      if (caps) {
        const order = ["video/H264", "video/VP9", "video/AV1", "video/VP8"];
        const sorted = [...caps.codecs].sort(
          (a, b) => order.indexOf(a.mimeType) - order.indexOf(b.mimeType),
        );
        pc.addTransceiver("video", { direction: "recvonly" }).setCodecPreferences?.(
          sorted as unknown as RTCRtpCodec[],
        );
      }
    } catch {
      /* غير مدعوم */
    }

    pc.ontrack = (e) => {
      // تقليل زمن التأخير: أصغر مخزن مؤقت ممكن
      try {
        (e.receiver as unknown as { jitterBufferTarget?: number }).jitterBufferTarget = 0;
        (e.receiver as unknown as { playoutDelayHint?: number }).playoutDelayHint = 0;
      } catch {
        /* غير مدعوم في بعض المتصفحات */
      }
      if (videoRef.current) {
        videoRef.current.srcObject = e.streams[0]!;
        void videoRef.current.play().catch(() => {});
      }
      setFailed(false);
      setLive(true);
    };

    const sig = openSignaling(
      deviceId,
      async (s: Signal) => {
        if (closed) return;
        if (s.type === "offer") {
          await pc.setRemoteDescription(s.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sig.send({ type: "answer", sdp: answer });
        } else if (s.type === "ice" && s.from === "host") {
          await pc.addIceCandidate(s.candidate).catch(() => {});
        }
      },
      { raw: true },
    );

    pc.onicecandidate = (e) => {
      if (e.candidate)
        void sig.send({ type: "ice", from: "viewer", candidate: e.candidate.toJSON() });
    };

    // إعادة إرسال طلب الانضمام حتى يستجيب جهاز الموظف
    let tries = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    sig.ready
      .then(() => {
        if (closed) return;
        void sig.send({ type: "join" });
        timer = setInterval(() => {
          if (closed || pc.remoteDescription) {
            if (timer) clearInterval(timer);
            return;
          }
          tries += 1;
          if (tries > 20) {
            if (timer) clearInterval(timer);
            setFailed(true);
            return;
          }
          void sig.send({ type: "join" });
        }, 2000);
      })
      .catch(() => {
        if (closed) return;
        setFailed(true);
      });

    return () => {
      closed = true;
      if (timer) clearInterval(timer);
      void sig.send({ type: "bye" }).catch(() => {});
      sig.close();
      pc.close();
    };
  }, [deviceId, enabled]);

  return { videoRef, live, failed };
}

function LiveScreen({
  device,
  online,
  expanded,
  onToggleExpand,
  onRemove,
}: {
  device: Device;
  online: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onRemove: () => void;
}) {
  const { videoRef, live, failed } = useDeviceStream(device.device_id, online);

  return (
    <div className="rounded-xl border border-border/60 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold text-sm">{device.employee_name ?? "موظف"}</div>
          <div className="text-xs text-muted-foreground">
            {device.device_label ?? device.os ?? "جهاز"}
          </div>
        </div>
        <Badge variant={online ? "default" : "secondary"}>
          {!online ? "غير متصل" : live ? "بث مباشر" : failed ? "لا يستجيب" : "جاري الاتصال…"}
        </Badge>
      </div>

      <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          autoPlay
          playsInline
          muted
        />
        {!live && (
          <div className="absolute inset-0 flex items-center justify-center">
            {!online ? (
              <span className="text-xs text-muted-foreground">الجهاز غير متصل</span>
            ) : failed ? (
              <span className="text-xs text-muted-foreground">
                تعذّر الاتصال — تأكد أن البرنامج مفتوح
              </span>
            ) : (
              <Loader2 className="size-6 animate-spin text-primary" />
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={onToggleExpand}>
          {expanded ? (
            <>
              <Minimize2 className="size-4 ml-1" /> تصغير
            </>
          ) : (
            <>
              <Maximize2 className="size-4 ml-1" /> تكبير
            </>
          )}
        </Button>
        <Button size="sm" variant="outline" onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function PairDeviceBox({ userId, title }: { userId?: string; title?: string } = {}) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const key = code.trim().toUpperCase();
    if (!key) return toast.error("اكتب مفتاح الربط الظاهر في برنامج الموظف");
    setBusy(true);
    const { data, error } = await supabase.rpc("agent_claim_pairing", { p_code: key });
    if (!error && userId) {
      const deviceId = (data as { device_id?: string } | null)?.device_id;
      if (deviceId) {
        await supabase.from("agent_devices").update({ user_id: userId }).eq("device_id", deviceId);
      }
    }
    setBusy(false);
    if (error) return toast.error("مفتاح غير صحيح أو منتهي");
    setCode("");
    toast.success("تم إضافة الجهاز — سيتصل تلقائيًا خلال ثوانٍ");
    void qc.invalidateQueries({ queryKey: ["agent-devices"] });
  };


  return (
    <div className="rounded-xl border border-border/60 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-primary" />
        <span className="text-sm font-bold">{title ?? "إضافة جهاز بمفتاح الربط"}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        الموظف يفتح البرنامج فيظهر له مفتاح ربط — اكتبه هنا ليعمل الجهاز دائمًا حتى تحذفه بنفسك.
      </p>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="مفتاح الربط (8 خانات)"
          className="font-mono tracking-widest"
          dir="ltr"
        />
        <Button onClick={() => void add()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "إضافة"}
        </Button>
      </div>
    </div>
  );
}

export function DeviceMonitorGrid() {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["agent-devices"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_devices")
        .select("id, device_id, employee_name, device_label, os, approved, last_seen_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Device[];
    },
  });

  const remove = async (d: Device) => {
    const { error } = await supabase.from("agent_devices").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    if (expandedId === d.id) setExpandedId(null);
    toast.success("تم إلغاء تسجيل الجهاز — سيظهر للموظف مفتاح ربط جديد");
    void qc.invalidateQueries({ queryKey: ["agent-devices"] });
  };

  const devices = data ?? [];
  const shown = expandedId ? devices.filter((d) => d.id === expandedId) : devices;

  return (
    <div className="card-surface rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Monitor className="size-5 text-primary" />
          <h3 className="font-bold">شاشات الموظفين المباشرة</h3>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`size-4 ml-1 ${isFetching ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      {!expandedId && <PairDeviceBox />}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لا توجد أجهزة مسجّلة بعد. نزّل برنامج الوكيل على جهاز الموظف — يوافق مرة واحدة فقط وبعدها
          تظهر شاشته هنا مباشرة طالما الجهاز متصل.
        </p>
      ) : (
        <div className={expandedId ? "" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
          {shown.map((d) => (
            <LiveScreen
              key={d.id}
              device={d}
              online={isOnline(d)}
              expanded={expandedId === d.id}
              onToggleExpand={() => setExpandedId(expandedId === d.id ? null : d.id)}
              onRemove={() => void remove(d)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
