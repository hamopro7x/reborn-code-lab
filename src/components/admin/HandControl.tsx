/**
 * التحكم بالإشارات اليدوية — ميزة مستقلة للأدمن على جهازه فقط.
 *
 * كل المعالجة محلية داخل المتصفح (MediaPipe HandLandmarker من
 * @mediapipe/tasks-vision الموجود بالمشروع). لا يتم رفع أي صورة/فيديو،
 * ولا علاقة لها بأجهزة الموظفين أو Remote Access.
 *
 * الإشارات:
 *  👆 السبابة        → تحريك المؤشر
 *  🤏 Pinch          → Left Click (مرة واحدة لكل ضمة)
 *  🤏🤏 Pinch مزدوج  → Double Click
 *  ✊ قبضة           → Right Click (مرة واحدة لكل قبضة)
 *  ✋ كف مفتوح        → إيقاف التحكم
 *  ↕️ حركة رأسية      → Scroll
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Hand, X } from "lucide-react";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function HandControl() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState({ cam: false, hand: false, ctrl: false });
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [hint, setHint] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lmRef = useRef<any>(null);
  const stopRef = useRef(false);

  // gesture state
  const posRef = useRef<Pt | null>(null);
  const pinchRef = useRef(false);
  const pinchTimeRef = useRef(0);
  const pendingClickRef = useRef<number | null>(null);
  const fistRef = useRef(false);
  const palmHoldRef = useRef(0);
  const scrollRef = useRef<{ y: number; t: number } | null>(null);
  const lastActionRef = useRef(0);

  const stop = useCallback(() => {
    stopRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
    setStatus({ cam: false, hand: false, ctrl: false });
    setCursor(null);
    posRef.current = null;
    pinchRef.current = false;
    fistRef.current = false;
    scrollRef.current = null;
    if (pendingClickRef.current) {
      clearTimeout(pendingClickRef.current);
      pendingClickRef.current = null;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  const at = (p: Pt) => document.elementFromPoint(p.x, p.y) as HTMLElement | null;

  const doClick = (p: Pt, dbl: boolean) => {
    const el = at(p);
    if (!el) return;
    const base = { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...base, pointerType: "mouse" } as any));
    el.dispatchEvent(new MouseEvent("mousedown", base));
    el.dispatchEvent(new PointerEvent("pointerup", { ...base, pointerType: "mouse" } as any));
    el.dispatchEvent(new MouseEvent("mouseup", base));
    el.dispatchEvent(new MouseEvent("click", { ...base, detail: 1 }));
    if (dbl) {
      el.dispatchEvent(new MouseEvent("click", { ...base, detail: 2 }));
      el.dispatchEvent(new MouseEvent("dblclick", { ...base, detail: 2 }));
    }
    setHint(dbl ? "Double Click" : "Left Click");
  };

  const doRightClick = (p: Pt) => {
    const el = at(p);
    if (!el) return;
    el.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 2 }),
    );
    setHint("Right Click");
  };

  const start = useCallback(async () => {
    setErr(null);
    stopRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setStatus((s) => ({ ...s, cam: true }));
      const v = videoRef.current!;
      v.srcObject = stream;
      v.muted = true;
      await v.play().catch(() => {});
    } catch {
      setErr("تم رفض إذن الكاميرا أو الكاميرا غير متاحة. اسمح بالوصول للكاميرا من إعدادات المتصفح.");
      return;
    }

    if (!lmRef.current) {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const files = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
        lmRef.current = await vision.HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 1,
        });
      } catch {
        setErr("فشل تحميل نموذج تتبع اليد. تحقق من الاتصال بالإنترنت.");
        stop();
        return;
      }
    }
    if (stopRef.current) return;
    setActive(true);
    setStatus((s) => ({ ...s, ctrl: true }));
    loop();
  }, [stop]);

  const loop = useCallback(() => {
    const step = (ts: number) => {
      if (stopRef.current) return;
      const v = videoRef.current;
      const lm = lmRef.current;
      if (v && lm && v.videoWidth) {
        let res: any = null;
        try {
          res = lm.detectForVideo(v, ts);
        } catch {
          /* skip frame */
        }
        const marks: Pt[] | undefined = res?.landmarks?.[0];
        if (!marks) {
          setStatus((s) => (s.hand ? { ...s, hand: false } : s));
          scrollRef.current = null;
        } else {
          setStatus((s) => (s.hand ? s : { ...s, hand: true }));
          handleHand(marks, ts);
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const handleHand = (m: Pt[], ts: number) => {
    const wrist = m[0]!;
    const scale = dist(wrist, m[9]!) || 0.1;
    const thumb = m[4]!;
    const index = m[8]!;

    // extended fingers (tip farther from wrist than pip)
    const ext = (tip: number, pip: number) => dist(wrist, m[tip]!) > dist(wrist, m[pip]!) * 1.12;
    const idxE = ext(8, 6);
    const midE = ext(12, 10);
    const rngE = ext(16, 14);
    const pkyE = ext(20, 18);
    const openPalm = idxE && midE && rngE && pkyE;
    const fist = !idxE && !midE && !rngE && !pkyE;
    const pinch = dist(thumb, index) / scale < 0.42;

    // ✋ open palm → disable (needs to be held to avoid flicker loops)
    if (openPalm) {
      if (!palmHoldRef.current) palmHoldRef.current = ts;
      if (ts - palmHoldRef.current > 700) {
        setHint("تم إيقاف التحكم باليد ✋");
        stop();
        return;
      }
    } else {
      palmHoldRef.current = 0;
    }

    // ✊ fist → right click (once per fist)
    if (fist) {
      if (!fistRef.current && ts - lastActionRef.current > 600) {
        fistRef.current = true;
        lastActionRef.current = ts;
        if (posRef.current) doRightClick(posRef.current);
      }
      scrollRef.current = null;
      return;
    }
    fistRef.current = false;

    // 👆 cursor from index tip (mirrored camera → flip x)
    const nx = 1 - index.x;
    // use a stable central region of the frame for better precision
    const map = (v: number) => Math.min(1, Math.max(0, (v - 0.15) / 0.7));
    const target = { x: map(nx) * window.innerWidth, y: map(index.y) * window.innerHeight };
    const prev = posRef.current;
    const smooth = prev ? { x: prev.x + (target.x - prev.x) * 0.35, y: prev.y + (target.y - prev.y) * 0.35 } : target;
    posRef.current = smooth;
    setCursor(smooth);
    const el = at(smooth);
    el?.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: smooth.x, clientY: smooth.y, view: window }),
    );

    // 🤏 pinch state machine: start → click / double click → wait release
    if (pinch && !pinchRef.current) {
      pinchRef.current = true;
      const gap = ts - pinchTimeRef.current;
      pinchTimeRef.current = ts;
      if (pendingClickRef.current && gap < 500) {
        clearTimeout(pendingClickRef.current);
        pendingClickRef.current = null;
        doClick(smooth, true);
      } else {
        const p = smooth;
        pendingClickRef.current = window.setTimeout(() => {
          pendingClickRef.current = null;
          doClick(p, false);
        }, 260);
      }
      lastActionRef.current = ts;
    } else if (!pinch && pinchRef.current) {
      pinchRef.current = false;
    }

    // ↕️ scroll from vertical hand movement while pointing (index only)
    if (idxE && !midE && !rngE && !pkyE && !pinch) {
      const cur = { y: wrist.y, t: ts };
      const last = scrollRef.current;
      if (last && cur.t - last.t > 40) {
        const dy = cur.y - last.y;
        if (Math.abs(dy) > 0.02) {
          const amount = dy * 1600;
          const el = at(smooth);
          const scroller = findScroller(el);
          if (scroller) scroller.scrollBy({ top: amount, behavior: "auto" });
          else window.scrollBy({ top: amount, behavior: "auto" });
          setHint(dy > 0 ? "Scroll Down" : "Scroll Up");
        }
        scrollRef.current = cur;
      } else if (!last) scrollRef.current = cur;
    } else {
      scrollRef.current = null;
    }
  };

  const findScroller = (el: HTMLElement | null): HTMLElement | null => {
    let n: HTMLElement | null = el;
    while (n && n !== document.body) {
      const st = getComputedStyle(n);
      if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 4) return n;
      n = n.parentElement;
    }
    return null;
  };

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(""), 900);
    return () => clearTimeout(t);
  }, [hint]);

  const dot = (ok: boolean, wait = false) => (ok ? "🟢" : wait ? "🟡" : "⚪️");

  return (
    <>
      {/* video عنصر مخفي/معاينة صغيرة */}
      <video ref={videoRef} playsInline muted className="hidden" />

      {/* زر عائم */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 left-4 z-[60] flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
        >
          <Hand className="size-4 text-primary" />
          التحكم باليد
        </button>
      )}

      {open && (
        <div className="fixed bottom-4 left-4 z-[60] w-[230px] rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur" dir="rtl">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Hand className="size-4 text-primary" />
              التحكم بالإشارات اليدوية
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-1 text-[11px] text-muted-foreground">
            <div>{dot(status.cam)} الكاميرا {status.cam ? "تعمل" : "متوقفة"}</div>
            <div>{dot(status.hand, active)} {status.hand ? "تم اكتشاف اليد" : active ? "في انتظار اليد" : "التتبع متوقف"}</div>
            <div>{dot(status.ctrl)} {status.ctrl ? "التحكم فعال" : "التحكم متوقف"}</div>
          </div>

          {active && (
            <div className="mt-2 overflow-hidden rounded-lg border border-border">
              <MiniPreview videoRef={videoRef} />
            </div>
          )}

          {err && <p className="mt-2 text-[11px] text-destructive">{err}</p>}

          <Button size="sm" className="mt-3 w-full text-xs" variant={active ? "secondary" : "default"} onClick={() => (active ? stop() : start())}>
            {active ? "إيقاف التحكم باليد" : "تشغيل التحكم باليد"}
          </Button>

          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            👆 مؤشر · 🤏 كليك · 🤏🤏 دبل كليك · ✊ كليك يمين · ✋ إيقاف · ↕️ تمرير
          </p>
        </div>
      )}

      {cursor && (
        <div
          className="pointer-events-none fixed z-[70] -translate-x-1/2 -translate-y-1/2"
          style={{ left: cursor.x, top: cursor.y }}
        >
          <div className="size-3 rounded-full bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.25)]" />
          {hint && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background">
              {hint}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** معاينة صغيرة تعرض نفس ستريم الكاميرا (محلي فقط). */
function MiniPreview({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement | null> }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const src = videoRef.current?.srcObject as MediaStream | null;
    if (ref.current && src) {
      ref.current.srcObject = src;
      ref.current.play().catch(() => {});
    }
  }, [videoRef]);
  return <video ref={ref} muted playsInline className="h-[80px] w-full scale-x-[-1] object-cover" />;
}
