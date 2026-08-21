/**
 * «استلام الشغل» identity gate — camera + Face Recognition + active liveness.
 * No fingerprint / WebAuthn anywhere in this flow.
 *
 * Pipeline guarantee: every analysed frame comes from `captureUprightFrame`,
 * which crops exactly the region rendered inside the preview box (same
 * object-cover math, same mirroring) — so Preview Frame == Recognition Frame.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ScanFace, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { claimWorkShift, enrollMyFace, getMyFaceStatus } from "@/lib/work.functions";
import {
  collectGoodFrames,
  captureUprightFrame,
  measureFrameQuality,
  openFrontCamera,
  waitForVideoReady,
} from "@/lib/face-camera";

/** The preview is mirrored (natural selfie feel); captures follow the same mirroring. */
const MIRROR = true;

const INSTRUCTIONS = [
  "تأكد من ظهور وجهك بالكامل داخل إطار التحقق.",
  "تأكد من وجود إضاءة جيدة ومتساوية.",
  "لا تغطِّ وجهك بكمامة أو غطاء، ويفضّل إزالة النظارات.",
  "اتبع تعليمات الحركة التي تظهر على الشاشة.",
];

type Step = "loading" | "intro" | "camera";
type Dir = "right" | "left";

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
  const challengeFn = useServerFn(startFaceChallenge);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [enrolled, setEnrolled] = useState(false);
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [arrow, setArrow] = useState<Dir | null>(null);

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

  // Live camera inside the frame (front camera, natural orientation).
  useEffect(() => {
    if (!open || step !== "camera") return;
    let alive = true;
    (async () => {
      try {
        const { stream } = await openFrontCamera();
        if (!alive) {
          stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          await waitForVideoReady(videoRef.current);
        }
        setStatus("ضع وجهك داخل إطار التحقق ثم اضغط الزر بالأسفل");
      } catch {
        setStatus("تعذّر تشغيل الكاميرا — اسمح بالوصول للكاميرا وحاول مرة أخرى");
      }
    })();
    return () => {
      alive = false;
      stopCamera();
    };
  }, [open, step, stopCamera]);

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Waits until the preview shows a usable (sharp, well-lit) frame. */
  const waitForUsableFrame = async (timeoutMs = 6000) => {
    const start = Date.now();
    let last = false;
    while (Date.now() - start < timeoutMs) {
      const q = measureFrameQuality(videoRef.current);
      if (q?.usable) return true;
      if (q && !last) {
        setStatus(
          q.brightness < 45
            ? "الإضاءة ضعيفة — تأكد من إضاءة جيدة ومتساوية"
            : "ثبّت وجهك قليلًا داخل إطار التحقق",
        );
        last = true;
      }
      await wait(150);
    }
    return !!captureUprightFrame(videoRef.current, { mirroredPreview: MIRROR });
  };

  /** Collects several good frames for one guided pose. */
  const posePhase = async (msg: string, want: number, dir: Dir | null = null) => {
    setArrow(dir);
    for (let s = 3; s >= 1; s--) {
      setStatus(`${msg} (${s})`);
      await wait(650);
    }
    setStatus(msg);
    const frames = await collectGoodFrames(videoRef.current, {
      want,
      mirroredPreview: MIRROR,
      onProgress: (got, total) => setStatus(`${msg} — ${got}/${total}`),
    });
    setStatus("تم ✓");
    await wait(250);
    setArrow(null);
    return frames;
  };

  const run = async () => {
    if (!captureUprightFrame(videoRef.current, { mirroredPreview: MIRROR })) {
      setStatus("الكاميرا لم تجهز بعد، انتظر لحظة");
      return;
    }
    setWorking(true);
    try {
      setStatus("جاري كشف الوجه داخل إطار التحقق...");
      await waitForUsableFrame();

      if (!enrolled) {
        const frames = await posePhase("انظر أمام الكاميرا مباشرة...", 3);
        setStatus("جاري إنشاء بيانات الوجه...");
        const res = await enrollFn({ data: { faceImages: frames } });
        if (!res.ok) {
          setStatus(res.error);
          toast.error(res.error);
          return;
        }
        setEnrolled(true);
        setStatus("تم إعداد التحقق من الوجه — اضغط «تحقق» لاستلام الشغل");
        toast.success("تم إنشاء بيانات الوجه");
        return;
      }

      // Dynamic movement challenge: the order comes from the server.
      const chal = await challengeFn({ data: undefined as any });
      const center = await posePhase("انظر أمام الكاميرا مباشرة...", 3);
      if (!center.length) {
        setStatus("لم يتم رصد الوجه — حاول مرة أخرى");
        return;
      }

      const steps: Array<{ dir: Dir; image: string }> = [];
      for (const dir of chal.steps as Dir[]) {
        const got = await posePhase("اتبع السهم ببطء", 1, dir);
        if (!got.length) {
          setStatus("لم يتم رصد الحركة المطلوبة — اتبع السهم ببطء");
          return;
        }
        steps.push({ dir, image: got[0]! });
      }
      const back = await posePhase("عد بوجهك للأمام...", 1);

      setStatus("جاري التحقق من الحيوية ومطابقة الوجه...");
      const res = await claimFn({
        data: {
          faceImages: center,
          steps,
          ...(back[0] ? { faceBack: back[0] } : {}),
        },
      });
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
      toast.success("تم التحقق من الوجه بنجاح");
      stopCamera();
      onOpenChange(false);
      onClaimed();
    } catch (e) {
      const msg = (e as Error).message || "تعذّر التحقق من الوجه، حاول مرة أخرى";
      setStatus(msg);
      toast.error(msg);
    } finally {
      setArrow(null);
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
              متابعة التحقق
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Portrait box (3:4) matching the natural front-camera framing. */}
            <div className="relative mx-auto aspect-[3/4] w-full max-w-[300px] overflow-hidden rounded-2xl border border-border/60 bg-black">
              <video
                ref={videoRef}
                muted
                playsInline
                className="size-full object-cover"
                style={{ transform: MIRROR ? "scaleX(-1)" : undefined, objectPosition: "center" }}
              />
              {/* Guide oval: head-sized and centred on the analysed crop. */}
              <div className="pointer-events-none absolute inset-x-[14%] inset-y-[10%] rounded-[50%] border-2 border-primary/80 shadow-[0_0_24px_oklch(0.7_0.15_220/0.45)]" />
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
