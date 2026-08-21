/**
 * «استلام الشغل» identity gate — camera + Face Recognition only.
 * First time: instructions screen → camera → face enrollment bound to the account.
 * Afterwards: camera box only → face verification against the account's face data.
 * No fingerprint / WebAuthn anywhere in this flow.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ScanFace, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { claimWorkShift, enrollMyFace, getMyFaceStatus } from "@/lib/work.functions";

const INSTRUCTIONS = [
  "تأكد من أن ملامح وجهك واضحة دون أي عوائق كبيرة.",
  "لا ترتدي أقنعة أو سماعات رأس أو أي أشياء قد تغطي وجهك.",
  "نوصي بإزالة النظارات لتجنب انعكاسات العدسات أو الوجه.",
  "يرجى التقاط الصورة في مكان مضاء جيدًا وبإضاءة متساوية.",
];

type Step = "loading" | "intro" | "camera";

export function FaceGate({
  open,
  onOpenChange,
  onClaimed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onClaimed: () => void;
}) {
  const statusFn = useServerFn(getMyFaceStatus);
  const enrollFn = useServerFn(enrollMyFace);
  const claimFn = useServerFn(claimWorkShift);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [enrolled, setEnrolled] = useState(false);
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Decide the flow: no face data → enrollment (intro first), else verification.
  useEffect(() => {
    if (!open) {
      stopCamera();
      setStep("loading");
      setStatus("");
      setWorking(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await statusFn({ data: undefined as any });
        if (!alive) return;
        setEnrolled(res.enrolled);
        setStep(res.enrolled ? "camera" : "intro");
      } catch {
        if (alive) {
          toast.error("تعذّر قراءة حالة التحقق");
          onOpenChange(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  // Live camera inside the frame.
  useEffect(() => {
    if (!open || step !== "camera") return;
    let alive = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus(enrolled ? "ضع وجهك داخل الإطار ثم اضغط «تحقق»" : "ضع وجهك داخل الإطار ثم اضغط «تسجيل الوجه»");
      } catch {
        setStatus("تعذّر تشغيل الكاميرا — اسمح بالوصول للكاميرا وحاول مرة أخرى");
      }
    })();
    return () => {
      alive = false;
      stopCamera();
    };
  }, [open, step, enrolled, stopCamera]);

  const grabFrame = (): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  };

  const run = async () => {
    const frame = grabFrame();
    if (!frame) {
      setStatus("الكاميرا لم تجهز بعد، انتظر لحظة");
      return;
    }
    setWorking(true);
    setStatus(enrolled ? "جاري التحقق..." : "جاري تسجيل بيانات الوجه...");
    try {
      if (!enrolled) {
        const res = await enrollFn({ data: { faceImage: frame } });
        if (!res.ok) {
          setStatus(res.error);
          toast.error(res.error);
          return;
        }
        setEnrolled(true);
        setStatus("تم تسجيل بيانات وجهك — اضغط «تحقق» لاستلام الشغل");
        toast.success("تم إنشاء بيانات الوجه");
        return;
      }
      const res = await claimFn({ data: { faceImage: frame } });
      if (!res.ok) {
        if (res.error === "NO_FACE_DATA") {
          setEnrolled(false);
          setStep("intro");
          setStatus("");
          return;
        }
        setStatus(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("تم استلام الشغل");
      stopCamera();
      onOpenChange(false);
      onClaimed();
    } catch (e) {
      const msg = (e as Error).message || "فشل التحقق من الوجه";
      setStatus(msg);
      toast.error(msg);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right text-base font-black">
            {step === "intro" ? <ShieldCheck className="size-4 text-primary" /> : <ScanFace className="size-4 text-primary" />}
            {step === "intro" ? "إعداد التحقق من الوجه" : "التحقق من الوجه"}
          </DialogTitle>
        </DialogHeader>

        {step === "loading" ? (
          <div className="grid h-40 place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : step === "intro" ? (
          <div className="space-y-4">
            <div className="grid h-40 place-items-center rounded-2xl border border-border/60 bg-secondary/40">
              <ScanFace className="size-16 text-primary/70" />
            </div>
            <p className="text-xs font-bold">
              هذه الخطوة مطلوبة مرة واحدة فقط لإعداد التعرف على وجهك (Face Recognition).
            </p>
            <ul className="space-y-2 text-[11px] leading-6 text-muted-foreground">
              {INSTRUCTIONS.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <Button className="w-full" onClick={() => setStep("camera")}>
              <ScanFace className="size-4" />
              التحقق من الوجه
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl border border-border/60 bg-black">
              <video ref={videoRef} muted playsInline className="size-full object-cover" />
              <div className="pointer-events-none absolute inset-6 rounded-[42%] border-2 border-primary/80 shadow-[0_0_24px_oklch(0.7_0.15_220/0.5)]" />
            </div>
            <div className="min-h-5 text-center text-[11px] font-bold text-muted-foreground">{status}</div>
            <Button className="w-full" onClick={() => void run()} disabled={working}>
              {working ? <Loader2 className="size-4 animate-spin" /> : <ScanFace className="size-4" />}
              {enrolled ? "تحقق" : "تسجيل الوجه"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Hook helper: gives a starter + the gate node to render. */
export function useFaceClaim(onClaimed: () => void) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  return {
    open,
    start: () => setOpen(true),
    node: (
      <FaceGate
        open={open}
        onOpenChange={setOpen}
        onClaimed={() => {
          qc.invalidateQueries({ queryKey: ["my-work-state"] });
          onClaimed();
        }}
      />
    ),
  };
}
