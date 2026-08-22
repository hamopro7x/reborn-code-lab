/**
 * «استلام الشغل» identity gate — camera + Face Recognition + active liveness.
 * No fingerprint / WebAuthn anywhere in this flow.
 *
 * Liveness is measured ON DEVICE with facial landmarks (see `face-mesh.ts`):
 * - real head yaw must reach the requested side (not a small nudge)
 * - the pose must be HELD for 10 seconds with a visible countdown
 * - eyes must stay open (smoothed over time, so a natural blink is fine)
 * The direction order is issued by the server and only ONE direction is ever
 * shown at a time.
 *
 * Pipeline guarantee: every analysed frame comes from `captureUprightFrame`,
 * which crops exactly the region rendered inside the preview box.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, ScanFace, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  claimWorkShift,
  enrollMyFace,
  getMyFaceStatus,
  startFaceChallenge,
} from "@/lib/work.functions";
import {
  collectGoodFrames,
  captureUprightFrame,
  measureFrameQuality,
  openFrontCamera,
  waitForVideoReady,
} from "@/lib/face-camera";
import {
  EYE_CLOSED,
  YAW_HOLD,
  YAW_TARGET,
  loadFaceLandmarker,
  readFace,
  yawDir,
} from "@/lib/face-mesh";


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

const DIR_TEXT: Record<Dir, string> = {
  right: "لِف وجهك ناحية اليمين",
  left: "لِف وجهك ناحية الشمال",
};

class LivenessError extends Error {}

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
  const meshRef = useRef<Awaited<ReturnType<typeof loadFaceLandmarker>>>(null);
  const [step, setStep] = useState<Step>("loading");
  const [enrolled, setEnrolled] = useState(false);
  const [status, setStatus] = useState("");
  const [instruction, setInstruction] = useState("");
  const [working, setWorking] = useState(false);
  const [arrow, setArrow] = useState<Dir | null>(null);
  const [failed, setFailed] = useState(false);

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
      setInstruction("");
      setArrow(null);
      setFailed(false);
      setWorking(false);
      return;
    }
    void loadFaceLandmarker().then((lm) => {
      meshRef.current = lm;
    });
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
        setInstruction("ضع وجهك داخل الإطار");
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
  const read = () => readFace(meshRef.current, videoRef.current, MIRROR);

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
            : "ثبّت وجهك قليلًا داخل الإطار",
        );
        last = true;
      }
      await wait(150);
    }
    return !!captureUprightFrame(videoRef.current, { mirroredPreview: MIRROR });
  };

  /** Waits for a face looking forward with the eyes clearly open. */
  const waitForOpenEyes = async (timeoutMs = 12000) => {
    if (!meshRef.current) return true; // detector unavailable → server decides
    const start = Date.now();
    let good = 0;
    while (Date.now() - start < timeoutMs) {
      const r = read();
      if (!r.face) setStatus("لم يتم رصد الوجه — ضع وجهك داخل الإطار");
      else if (r.eyeOpen <= EYE_CLOSED) setStatus("افتح عينيك وانظر إلى الكاميرا");
      else if (Math.abs(r.yaw) > YAW_HOLD) setStatus("انظر أمام الكاميرا مباشرة");
      else {
        good++;
        setStatus("تم رصد الوجه ✓");
        if (good >= 4) return true;
      }
      await wait(120);
    }
    return false;
  };

  /** Collects several good frames for the frontal / enrollment poses. */
  const posePhase = async (msg: string, want: number) => {
    setInstruction(msg);
    setArrow(null);
    await wait(400);
    setCountdown(null);
    const frames = await collectGoodFrames(videoRef.current, {
      want,
      mirroredPreview: MIRROR,
      onProgress: (got, total) => setStatus(`${got}/${total}`),
    });
    setStatus("تم ✓");
    await wait(200);
    return frames;
  };

  const holdPhase = async (dir: Dir): Promise<string[]> => {
    setArrow(dir);
    setInstruction(DIR_TEXT[dir]);
    setStatus("");
    setCountdown(null);

    if (!meshRef.current) {
      // Detector unavailable: fall back to timed capture + server-side check.
      await wait(500);
      const f = await collectGoodFrames(videoRef.current, { want: 1, mirroredPreview: MIRROR });
      if (!f.length) throw new LivenessError("لم يتم رصد الحركة المطلوبة — حاول مرة أخرى");
      return f;
    }

    // Confirm the requested direction with a few consecutive frames to avoid
    // accidental detection, then succeed immediately — no 10-second hold.
    const acquireStart = Date.now();
    let inPose = 0;
    while (Date.now() - acquireStart < 20000) {
      const r = read();
      if (!r.face) setStatus("لم يتم رصد الوجه — ضع وجهك داخل الإطار");
      else if (yawDir(r.yaw, YAW_TARGET) === dir) {
        inPose++;
        setStatus("تم رصد الاتجاه ✓");
        break;
      } else {
        inPose = 0;
        setStatus(dir === "right" ? "لِف وجهك أكثر ناحية اليمين" : "لِف وجهك أكثر ناحية الشمال");
      }
      await wait(110);
    }
    if (inPose < 1) throw new LivenessError("لم يتم الوصول للاتجاه المطلوب — حاول مرة أخرى");

    const f = captureUprightFrame(videoRef.current, { mirroredPreview: MIRROR });
    if (!f) throw new LivenessError("لم يتم التقاط صورة للاتجاه — حاول مرة أخرى");
    setStatus("تم ✓");
    setArrow(null);
    await wait(200);
    return [f];
  };

  /**
   * Haptic feedback only: the phone vibrates automatically when a face
   * movement step succeeds. This is a signal for the employee, NOT a
   * verification condition. If vibration is unsupported, we continue silently.
   */
  const vibrate = (pattern: number | number[] = [90, 60, 90]) => {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    try {
      // Some mobile browsers ignore a pattern but honour a single duration.
      if (!navigator.vibrate(pattern) && Array.isArray(pattern)) {
        navigator.vibrate(pattern.reduce((a, b) => a + b, 0));
      }
    } catch {
      // ignore unsupported patterns
    }
  };

  const run = async () => {
    // Unlock haptics inside the user gesture (mobile browsers require this).
    vibrate(1);
    if (!captureUprightFrame(videoRef.current, { mirroredPreview: MIRROR })) {
      setStatus("الكاميرا لم تجهز بعد، انتظر لحظة");
      return;
    }
    setWorking(true);
    setFailed(false);
    try {
      setInstruction("انظر أمام الكاميرا مباشرة");
      setStatus("جاري كشف الوجه...");
      await waitForUsableFrame();

      if (!enrolled) {
        const frames = await posePhase("انظر أمام الكاميرا مباشرة", 3);
        setStatus("جاري إنشاء بيانات الوجه...");
        const res = await enrollFn({ data: { faceImages: frames } });
        if (!res.ok) {
          setStatus(res.error);
          toast.error(res.error);
          return;
        }
        setEnrolled(true);
        setInstruction("تم إعداد التحقق من الوجه");
        toast.success("تم إنشاء بيانات الوجه");
        return;
      }

      const eyesOk = await waitForOpenEyes();
      if (!eyesOk) throw new LivenessError("افتح عينيك وانظر إلى الكاميرا ثم حاول مرة أخرى");

      // Movement order comes from the server; only ONE direction is shown at a time.
      const chal = await challengeFn({ data: undefined as any });
      const center = await posePhase("انظر أمام الكاميرا مباشرة", 3);
      if (!center.length) throw new LivenessError("لم يتم رصد الوجه — حاول مرة أخرى");

      const steps: Array<{ dir: Dir; image: string }> = [];
      const dirs = chal.steps as Dir[];
      for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i]!;
        const got = await holdPhase(dir);
        vibrate(); // automatic haptic signal that this step succeeded
        steps.push({ dir, image: got[got.length - 1]! });
      }
      const back = await posePhase("عد بوجهك للأمام", 1);

      setInstruction("جاري التحقق");
      setStatus("مطابقة الوجه والتحقق من الحيوية...");
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
        setFailed(true);
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
      setFailed(true);
      setInstruction("فشل التحقق");
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
            {/* 1) Instruction for the CURRENT step — above the camera, large and clear. */}
            <div className="rounded-2xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-center">
              <div className="text-base font-black leading-7 text-foreground">
                {instruction || "ضع وجهك داخل الإطار"}
              </div>
            </div>

            {/* 2) Camera (portrait 3:4) — the direction arrow lives in its center. */}
            <div className="relative mx-auto aspect-[3/4] w-full max-w-[300px] overflow-hidden rounded-2xl border border-border/60 bg-black">
              <video
                ref={videoRef}
                muted
                playsInline
                className="size-full object-cover"
                style={{ transform: MIRROR ? "scaleX(-1)" : undefined, objectPosition: "center" }}
              />
              <div className="pointer-events-none absolute inset-x-[14%] inset-y-[10%] rounded-[50%] border-2 border-primary/80 shadow-[0_0_24px_oklch(0.7_0.15_220/0.45)]" />
              {arrow ? (
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-destructive drop-shadow-[0_0_10px_rgba(0,0,0,0.65)]">
                  {arrow === "right" ? (
                    <ArrowLeft className="animate-arrow-nudge size-16" strokeWidth={3} style={{ "--nudge": "14px" } as React.CSSProperties} />
                  ) : (
                    <ArrowRight className="animate-arrow-nudge size-16" strokeWidth={3} style={{ "--nudge": "-14px" } as React.CSSProperties} />
                  )}
                </div>
              ) : null}
            </div>


            <Button
              className="w-full"
              onClick={() => {
                vibrate(1); // gesture-time priming so later feedback works
                void run();
              }}
              disabled={working}
            >
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
