import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MonitorUp, StopCircle, Copy } from "lucide-react";
import { RTC_CONFIG, makeCode, openSignaling, type Signal } from "@/lib/screenshare";

export const Route = createFileRoute("/share")({
  head: () => ({
    meta: [
      { title: "مشاركة الشاشة مع الدعم | MAG PRO" },
      {
        name: "description",
        content: "شارك شاشة جهازك مباشرة مع فريق الدعم الفني في MAG PRO بضغطة واحدة وبدون تحميل أي برامج.",
      },
      { property: "og:title", content: "مشاركة الشاشة مع الدعم | MAG PRO" },
      {
        property: "og:description",
        content: "شارك شاشة جهازك مباشرة مع فريق الدعم الفني بدون تحميل أي برامج.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SharePage,
});

function SharePage() {
  const [code, setCode] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [viewerConnected, setViewerConnected] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sigRef = useRef<ReturnType<typeof openSignaling> | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    void sigRef.current?.send({ type: "bye" });
    sigRef.current?.close();
    sigRef.current = null;
    setSharing(false);
    setViewerConnected(false);
    setCode(null);
  };

  useEffect(() => () => stop(), []);

  const start = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      });
    } catch {
      toast.error("لازم تسمح بمشاركة الشاشة");
      return;
    }
    streamRef.current = stream;
    if (previewRef.current) {
      previewRef.current.srcObject = stream;
      void previewRef.current.play().catch(() => {});
    }
    stream.getVideoTracks()[0]?.addEventListener("ended", stop);

    const sessionCode = makeCode();
    setCode(sessionCode);
    setSharing(true);

    const sig = openSignaling(sessionCode, async (s: Signal) => {
      if (s.type === "join") {
        pcRef.current?.close();
        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        pc.onicecandidate = (e) => {
          if (e.candidate) void sig.send({ type: "ice", from: "host", candidate: e.candidate.toJSON() });
        };
        pc.onconnectionstatechange = () => setViewerConnected(pc.connectionState === "connected");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sig.send({ type: "offer", sdp: offer });
      } else if (s.type === "answer") {
        await pcRef.current?.setRemoteDescription(s.sdp);
      } else if (s.type === "ice" && s.from === "viewer") {
        try {
          await pcRef.current?.addIceCandidate(s.candidate);
        } catch {
          /* ignore */
        }
      }
    });
    sigRef.current = sig;
    try {
      await sig.ready;
    } catch {
      toast.error("تعذّر الاتصال بسيرفر المشاركة — تحقق من الإنترنت وحاول مرة أخرى");
    }
  };


  return (
    <main className="container mx-auto max-w-2xl px-4 py-12 space-y-6">
      <h1 className="text-2xl font-bold">مشاركة الشاشة مع الدعم</h1>
      <p className="text-muted-foreground text-sm">
        اضغط «ابدأ المشاركة»، اختار الشاشة أو النافذة، وابعت الكود اللي هيظهر لمسؤول الدعم — هيشوف شاشتك مباشرة.
      </p>

      {!sharing ? (
        <Button size="lg" onClick={start}>
          <MonitorUp className="size-5 ml-2" /> ابدأ المشاركة
        </Button>
      ) : (
        <div className="space-y-4">
          <div className="card-surface rounded-2xl p-4 space-y-2 text-center">
            <div className="text-sm text-muted-foreground">كود الجلسة</div>
            <div className="text-4xl font-mono font-bold tracking-widest" dir="ltr">
              {code}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(code ?? "");
                toast.success("تم نسخ الكود");
              }}
            >
              <Copy className="size-4 ml-1" /> نسخ الكود
            </Button>
            <div className="text-xs text-muted-foreground pt-1">
              {viewerConnected ? "الدعم متصل ويشوف شاشتك الآن" : "في انتظار اتصال الدعم…"}
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden bg-black aspect-video">
            <video ref={previewRef} className="w-full h-full object-contain" autoPlay playsInline muted />
          </div>

          <Button variant="destructive" onClick={stop}>
            <StopCircle className="size-5 ml-2" /> إيقاف المشاركة
          </Button>
        </div>
      )}
    </main>
  );
}
