import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Monitor, PhoneOff, RefreshCw, Trash2, Video } from "lucide-react";
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

function WatchPanel({ device, onClose }: { device: Device; onClose: () => void }) {
  const [live, setLive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let closed = false;
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.ontrack = (e) => {
      if (videoRef.current) {
        videoRef.current.srcObject = e.streams[0]!;
        void videoRef.current.play().catch(() => {});
      }
      setLive(true);
    };

    const sig = openSignaling(
      device.device_id,
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
      if (e.candidate) void sig.send({ type: "ice", from: "viewer", candidate: e.candidate.toJSON() });
    };

    void sig.ready.then(() => sig.send({ type: "join" }));

    return () => {
      closed = true;
      void sig.send({ type: "bye" }).catch(() => {});
      sig.close();
      pc.close();
    };
  }, [device.device_id]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-bold">{device.employee_name ?? "موظف"}</span>{" "}
          <span className="text-muted-foreground">— {live ? "بث مباشر" : "جاري الاتصال…"}</span>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          <PhoneOff className="size-4 ml-1" /> إنهاء المشاهدة
        </Button>
      </div>
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
        <video ref={videoRef} className="w-full h-full object-contain" autoPlay playsInline muted />
        {!live && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}

export function DeviceMonitorGrid() {
  const qc = useQueryClient();
  const [watching, setWatching] = useState<Device | null>(null);

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
    if (watching?.id === d.id) setWatching(null);
    toast.success("تم إلغاء تسجيل الجهاز");
    void qc.invalidateQueries({ queryKey: ["agent-devices"] });
  };

  const devices = data ?? [];

  return (
    <div className="card-surface rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Monitor className="size-5 text-primary" />
          <h3 className="font-bold">أجهزة الموظفين المسجّلة</h3>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`size-4 ml-1 ${isFetching ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      {watching ? (
        <WatchPanel device={watching} onClose={() => setWatching(null)} />
      ) : isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لا توجد أجهزة مسجّلة بعد. نزّل برنامج الوكيل على جهاز الموظف — يوافق مرة واحدة فقط وبعدها
          يظهر هنا تلقائيًا وتشاهد شاشته وقت ما تحب أثناء اتصاله.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => {
            const online = isOnline(d);
            return (
              <div key={d.id} className="rounded-xl border border-border/60 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm">{d.employee_name ?? "موظف"}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.device_label ?? d.os ?? "جهاز"}
                    </div>
                  </div>
                  <Badge variant={online ? "default" : "secondary"}>
                    {online ? "متصل" : "غير متصل"}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">
                  {d.device_id.slice(0, 12)}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" disabled={!online} onClick={() => setWatching(d)}>
                    <Video className="size-4 ml-1" /> مشاهدة
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void remove(d)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
