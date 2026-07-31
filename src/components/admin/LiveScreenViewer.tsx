import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, MonitorPlay, PhoneOff } from "lucide-react";
import { RTC_CONFIG, openSignaling, type Signal } from "@/lib/screenshare";

type State = "idle" | "connecting" | "live";

export function LiveScreenViewer() {
  const [code, setCode] = useState("");
  const [state, setState] = useState<State>("idle");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sigRef = useRef<ReturnType<typeof openSignaling> | null>(null);

  const cleanup = () => {
    pcRef.current?.close();
    pcRef.current = null;
    sigRef.current?.close();
    sigRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => cleanup, []);

  const connect = async () => {
    const c = code.trim().toUpperCase();
    if (c.length < 4) return toast.error("اكتب كود الجلسة اللي ظهر عند الموظف");
    cleanup();
    setState("connecting");

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    pc.ontrack = (e) => {
      if (videoRef.current) {
        videoRef.current.srcObject = e.streams[0]!;
        void videoRef.current.play().catch(() => {});
      }
      setState("live");
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        setState("idle");
      }
    };

    const sig = openSignaling(c, async (s: Signal) => {
      if (s.type === "offer") {
        await pc.setRemoteDescription(s.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sig.send({ type: "answer", sdp: answer });
      } else if (s.type === "ice" && s.from === "host") {
        try {
          await pc.addIceCandidate(s.candidate);
        } catch {
          /* ignore */
        }
      } else if (s.type === "bye") {
        toast.info("الموظف أوقف المشاركة");
        cleanup();
        setState("idle");
      }
    });
    sigRef.current = sig;

    pc.onicecandidate = (e) => {
      if (e.candidate) void sig.send({ type: "ice", from: "viewer", candidate: e.candidate.toJSON() });
    };

    await sig.ready;
    await sig.send({ type: "join" });
  };

  const hangup = async () => {
    await sigRef.current?.send({ type: "bye" });
    cleanup();
    setState("idle");
  };

  return (
    <div className="card-surface rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <MonitorPlay className="size-5 text-primary" />
        <h3 className="font-bold">مشاهدة شاشة موظف مباشرة (داخل الموقع)</h3>
      </div>

      {state === "idle" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            الموظف يفتح صفحة <span className="font-mono" dir="ltr">/share</span> من نفس الموقع ويضغط «ابدأ المشاركة»،
            ثم يبعتلك كود الجلسة. اكتب الكود هنا وشوف شاشته على طول بدون أي برامج.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label>كود الجلسة</Label>
              <Input
                dir="ltr"
                className="font-mono uppercase w-40"
                placeholder="A1B2C3"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </div>
            <Button onClick={connect}>اتصال</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {state === "connecting" ? "جاري الاتصال…" : "متصل — بث مباشر"}
            </span>
            <Button variant="outline" size="sm" onClick={hangup}>
              <PhoneOff className="size-4 ml-1" /> إنهاء
            </Button>
          </div>
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
            <video ref={videoRef} className="w-full h-full object-contain" autoPlay playsInline muted={false} />
            {state === "connecting" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-8 animate-spin text-primary" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
