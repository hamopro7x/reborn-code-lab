import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { KeyRound, Loader2, Maximize2, Minimize2, Monitor, MonitorOff, MousePointerClick, RefreshCw, Trash2 } from "lucide-react";

import { RTC_CONFIG, makeViewerId, openSignaling, type Signal } from "@/lib/screenshare";

type Device = {
  id: string;
  device_id: string;
  employee_name: string | null;
  device_label: string | null;
  os: string | null;
  approved: boolean;
  app_version?: string | null;
  last_seen_at: string | null;
  created_at: string;
  user_id?: string | null;

};


const isOnline = (d: Device) =>
  !!d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < 75_000;

/** يفتح بثاً مباشراً للجهاز تلقائياً طالما enabled = true (زي كاميرات المراقبة) */
function useDeviceStream(deviceId: string, enabled: boolean) {
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);
  // كل زيادة تعيد بناء الاتصال من الصفر (إعادة اتصال تلقائية)
  const [attempt, setAttempt] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // قناة التحكم عن بعد (ينشئها جهاز الموظف ونستقبلها هنا)
  const ctlRef = useRef<RTCDataChannel | null>(null);
  const [canControl, setCanControl] = useState(false);
  const sendInput = (cmd: Record<string, unknown>) => {
    const ch = ctlRef.current;
    if (!ch || ch.readyState !== "open") return;
    // ضغط خلفي: لو الطابور امتلأ نُسقط الأمر بدل ما يتأخر التحكم كله
    if (ch.bufferedAmount > 65_536) return;
    try {
      ch.send(JSON.stringify(cmd));
    } catch {
      /* القناة أُغلقت */
    }
  };

  // حركة الماوس تُجمَّع في إطار عرض واحد (~60 مرة/ث) بدل إرسال كل حدث
  const moveRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const sendMove = (p: { x: number; y: number }) => {
    moveRef.current = p;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const m = moveRef.current;
      moveRef.current = null;
      if (m) sendInput({ t: "move", x: m.x, y: m.y });
    });
  };




  // مهلة سماح: لا نقطع البث لمجرد تأخّر نبضة الجهاز 15-60 ثانية
  const [sticky, setSticky] = useState(enabled);
  useEffect(() => {
    if (enabled) {
      setSticky(true);
      return;
    }
    const t = setTimeout(() => setSticky(false), 45_000);
    return () => clearTimeout(t);
  }, [enabled]);

  useEffect(() => {
    if (!sticky) {
      setLive(false);
      setFailed(false);
      return;
    }
    let closed = false;
    setLive(false);
    setFailed(false);
    // معرّف فريد لكل مشاهد: يسمح بعدة أجهزة إدارة تشاهد نفس الجهاز في نفس الوقت
    const viewerId = makeViewerId();
    const pc = new RTCPeerConnection(RTC_CONFIG);






    // إعادة الاتصال تلقائياً عند انقطاع/فشل مسار ICE
    let recoverTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReconnect = (delay: number) => {
      if (closed || recoverTimer) return;
      recoverTimer = setTimeout(() => {
        if (closed) return;
        setAttempt((n) => n + 1);
      }, delay);
    };
    const cancelReconnect = () => {
      if (recoverTimer) clearTimeout(recoverTimer);
      recoverTimer = undefined;
    };
    pc.onconnectionstatechange = () => {
      if (closed) return;
      if (pc.connectionState === "connected") {
        cancelReconnect();
        setFailed(false);
        return;
      }
      if (pc.connectionState === "disconnected") {
        try {
          pc.restartIce();
        } catch {
          /* غير مدعوم */
        }
        scheduleReconnect(4000);
      } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        setLive(false);
        scheduleReconnect(1200);
      }
    };
    const pendingIce: RTCIceCandidateInit[] = [];
    let acceptedOfferSdp: string | undefined;

    // مستقبل فيديو واحد بالإعدادات الافتراضية للمتصفح.
    // (ترتيب الكودك يدوياً كان يسبب سقوط أول keyframe = شاشة سوداء)
    try {
      pc.addTransceiver("video", { direction: "recvonly" });
    } catch {
      /* غير مدعوم */
    }

    pc.ontrack = (e) => {
      // مخزن تشغيل صغير لكن ليس صفراً: 0.03s كان يسبب تجميد/سواد عند أي فقد حزم.
      try {
        // مخزن صغير (80ms) = صورة أسرع بتأخير أقل، وما زال يمتص فقد الحزم
        // أقل تأخير ممكن: نلعب الإطار بمجرد وصوله (بدون مخزن مؤقت)
        (e.receiver as unknown as { jitterBufferTarget?: number }).jitterBufferTarget = 0;
        (e.receiver as unknown as { playoutDelayHint?: number }).playoutDelayHint = 0;
      } catch {
        /* غير مدعوم في بعض المتصفحات */
      }

      // انتهاء المسار من جهة الموظف = إعادة اتصال فوري
      e.track.addEventListener("ended", () => {
        if (closed) return;
        setLive(false);
        scheduleReconnect(1000);
      });
      // كتم المسار مؤقتاً (انقطاع حزم) = نُظهر مؤشر الانتظار بدل شاشة سوداء
      e.track.addEventListener("mute", () => {
        if (!closed) setLive(false);
      });
      e.track.addEventListener("unmute", () => {
        if (!closed) setFailed(false);
      });

      const v = videoRef.current;
      if (v) {
        v.srcObject = e.streams[0] ?? new MediaStream([e.track]);
        // لا نعلن "بث مباشر" إلا عند وصول أول إطار حقيقي
        const markLive = () => {
          if (!closed) {
            setFailed(false);
            setLive(true);
          }
        };
        const rvfc = (v as unknown as { requestVideoFrameCallback?: (cb: () => void) => number })
          .requestVideoFrameCallback;
        if (typeof rvfc === "function") rvfc.call(v, markLive);
        else v.addEventListener("timeupdate", markLive, { once: true });
        void v.play().catch(() => {});
      }
      setFailed(false);
    };

    // قناة التحكم يفتحها جهاز الموظف
    pc.ondatachannel = (e) => {
      if (e.channel.label !== "ctl") return;
      ctlRef.current = e.channel;
      e.channel.onopen = () => {
        if (!closed) setCanControl(true);
      };
      e.channel.onclose = () => {
        if (!closed) setCanControl(false);
      };
      if (e.channel.readyState === "open") setCanControl(true);
    };



    const sig = openSignaling(
      deviceId,
      async (s: Signal) => {
        if (closed) return;
        // نتجاهل الإشارات الموجّهة لمشاهد آخر
        const to = (s as { to?: string }).to;
        if (to && to !== viewerId) return;
        if (s.type === "offer") {
          const offerSdp = s.sdp.sdp;
          // Polling وRealtime قد يسلّمان نفس العرض في نفس اللحظة. نحجزه قبل
          // أول await حتى لا ينفذ setRemoteDescription مرتين بالتوازي ويعلق
          // جهاز واحد بينما تعمل الأجهزة الأخرى.
          if (!offerSdp || acceptedOfferSdp === offerSdp || pc.remoteDescription?.sdp === offerSdp) return;
          if (pc.signalingState !== "stable") return;
          acceptedOfferSdp = offerSdp;
          try {
            await pc.setRemoteDescription(s.sdp);
            for (const candidate of pendingIce.splice(0)) {
              await pc.addIceCandidate(candidate).catch(() => {});
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            // ننتظر قليلاً حتى تدخل مرشحات ICE في الإجابة نفسها؛ الرسائل
            // المنفصلة تظل مساراً سريعاً، لكن الاتصال لم يعد يعتمد عليها.
            if (pc.iceGatheringState !== "complete") {
              await new Promise<void>((resolve) => {
                let settled = false;
                const finish = () => {
                  if (settled) return;
                  settled = true;
                  clearTimeout(timeout);
                  pc.removeEventListener("icegatheringstatechange", onChange);
                  resolve();
                };
                const onChange = () => {
                  if (pc.iceGatheringState === "complete") finish();
                };
                const timeout = setTimeout(finish, 1800);
                pc.addEventListener("icegatheringstatechange", onChange);
              });
            }
            const completeAnswer = pc.localDescription;
            if (!completeAnswer) throw new Error("تعذّر إنشاء إجابة الاتصال");
            await sig.send({ type: "answer", sdp: completeAnswer, viewer: viewerId });
          } catch {
            acceptedOfferSdp = undefined;
            scheduleReconnect(400);
          }
        } else if (s.type === "ice" && s.from === "host") {
          if (pc.remoteDescription) await pc.addIceCandidate(s.candidate).catch(() => {});
          else pendingIce.push(s.candidate);
        }
      },
      { raw: true, viewerId },
    );


    pc.onicecandidate = (e) => {
      if (e.candidate)
        void sig.send({
          type: "ice",
          from: "viewer",
          viewer: viewerId,
          candidate: e.candidate.toJSON(),
        });
    };

    // إعادة إرسال طلب الانضمام حتى يستجيب جهاز الموظف
    let tries = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    sig.ready
      .then(() => {
        if (closed) return;
        void sig.send({ type: "join", viewer: viewerId });
        timer = setInterval(() => {
          if (closed || pc.remoteDescription) {
            if (timer) clearInterval(timer);
            return;
          }
          tries += 1;
          if (tries > 30) {
            if (timer) clearInterval(timer);
            setFailed(true);
            // لا نتوقف نهائياً: نحاول من جديد بعد قليل
            scheduleReconnect(3000);
            return;
          }
          void sig.send({ type: "join", viewer: viewerId });
        }, 350);
      })
      .catch(() => {
        if (closed) return;
        setFailed(true);
        scheduleReconnect(8000);
      });

    // مراقب توقّف الصورة: نعتمد على عدد الإطارات المفكوكة فعلاً (framesDecoded)
    // لأن الشاشة قد تتجمّد بينما currentTime يتقدّم، فتظهر "بث مباشر" بلا صورة.
    let lastFrames = -1;
    let stalled = 0;
    const watchdog = setInterval(() => {
      const v = videoRef.current;
      if (closed || !v || !v.srcObject) return;
      void pc
        .getStats()
        .then((stats) => {
          if (closed) return;
          let frames = -1;
          stats.forEach((r: any) => {
            if (r.type === "inbound-rtp" && r.kind === "video" && typeof r.framesDecoded === "number") {
              frames = r.framesDecoded;
            }
          });
          if (frames < 0) return;
          if (frames === lastFrames) {
            stalled += 1;
            setLive(false);
            if (stalled === 2) {
              // تجميد ~3 ثوانٍ: إصلاح مسار ICE بدون قطع البث
              try {
                pc.restartIce();
              } catch {
                /* غير مدعوم */
              }
              void v.play().catch(() => {});
            } else if (stalled >= 4) {
              stalled = 0;
              scheduleReconnect(400);
            }
          } else {
            stalled = 0;
            lastFrames = frames;
            setLive(true);
          }
        })
        .catch(() => {});
    }, 1500);



    return () => {
      closed = true;
      if (timer) clearInterval(timer);
      clearInterval(watchdog);
      cancelReconnect();
      ctlRef.current = null;
      setCanControl(false);
      void sig.send({ type: "bye", viewer: viewerId }).catch(() => {});
      sig.close();
      pc.close();
    };
  }, [deviceId, sticky, attempt]);


  return { videoRef, live, failed, canControl, sendInput, sendMove };
}



function LiveScreen({
  device,
  online,
  startupDelay,
  expanded,
  onToggleExpand,
  onRemove,
}: {
  device: Device;
  online: boolean;
  startupDelay: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onRemove?: () => void;
}) {
  const [streamEnabled, setStreamEnabled] = useState(startupDelay === 0 && online);
  useEffect(() => {
    if (!online) {
      setStreamEnabled(false);
      return;
    }
    const timer = setTimeout(() => setStreamEnabled(true), startupDelay);
    return () => clearTimeout(timer);
  }, [online, startupDelay]);
  const { videoRef, live, failed, canControl, sendInput, sendMove } = useDeviceStream(
    device.device_id,
    streamEnabled,
  );
  const [controlling, setControlling] = useState(false);
  const active = controlling && canControl && live;

  // إحداثيات نسبية (0..1) بالنسبة للصورة الفعلية داخل object-contain
  const toPoint = (e: React.MouseEvent) => {
    const v = videoRef.current;
    if (!v) return null;
    const r = v.getBoundingClientRect();
    const vw = v.videoWidth || r.width;
    const vh = v.videoHeight || r.height;
    const scale = Math.min(r.width / vw, r.height / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const ox = (r.width - dw) / 2;
    const oy = (r.height - dh) / 2;
    const x = (e.clientX - r.left - ox) / dw;
    const y = (e.clientY - r.top - oy) / dh;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  };

  useEffect(() => {
    if (!active) return;
    const stop = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onDown = (e: KeyboardEvent) => {
      stop(e);
      // حرف قابل للطباعة (يشمل العربي والحروف الكبيرة) يُرسل كنص مباشر
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        sendInput({ t: "text", s: e.key });
        return;
      }
      sendInput({ t: "key", key: e.key, down: true });
    };
    const onUp = (e: KeyboardEvent) => {
      stop(e);
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) return;
      sendInput({ t: "key", key: e.key, down: false });
    };
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
    };
  }, [active, sendInput]);

  return (
    <div className="w-full rounded-xl border border-border/60 p-3 space-y-2 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-sm truncate">{device.employee_name ?? "موظف"}</div>
          <div className="text-xs text-muted-foreground truncate">
            {device.device_label ?? device.os ?? "جهاز"}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="حذف الشاشة"
              title="حذف الشاشة"
              onClick={onRemove}
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          )}
          <Badge variant="outline" className="text-[10px]" dir="ltr">
            {device.app_version ? "v" + device.app_version : "—"}
          </Badge>
          <Badge variant={online ? "default" : "secondary"}>
            {!online ? "غير متصل" : live ? "بث مباشر" : failed ? "لا يستجيب" : "جاري الاتصال…"}
          </Badge>
        </div>
      </div>

      <div
        className={`relative w-full rounded-lg overflow-hidden bg-black ${expanded ? "h-[70vh]" : "aspect-video"} ${active ? "ring-2 ring-primary cursor-crosshair" : ""}`}
        onMouseMove={
          active
            ? (e) => {
                const p = toPoint(e);
                if (p) sendMove(p);
              }
            : undefined
        }
        onMouseDown={
          active
            ? (e) => {
                e.preventDefault();
                const p = toPoint(e);
                if (p) sendInput({ t: "down", b: e.button, ...p });
              }
            : undefined
        }
        onMouseUp={
          active
            ? (e) => {
                e.preventDefault();
                const p = toPoint(e);
                if (p) sendInput({ t: "up", b: e.button, ...p });
              }
            : undefined
        }
        onDoubleClick={
          active
            ? (e) => {
                const p = toPoint(e);
                if (!p) return;
                for (let i = 0; i < 2; i++) {
                  sendInput({ t: "down", b: 0, ...p });
                  sendInput({ t: "up", b: 0 });
                }
              }
            : undefined
        }
        onContextMenu={active ? (e) => e.preventDefault() : undefined}
        onWheel={
          active
            ? (e) => {
                e.preventDefault();
                sendInput({ t: "wheel", d: Math.round(Math.max(-600, Math.min(600, -e.deltaY))) });
              }
            : undefined
        }
      >
        {online ? (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-contain"
            autoPlay
            playsInline
            muted
          />
        ) : null}

        {!live && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black">
            {!online ? (
              <>
                <MonitorOff className="size-7 text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground">
                  تم إيقاف الشاشة — الجهاز مغلق
                </span>
              </>
            ) : failed ? (
              <span className="text-xs text-muted-foreground">
                تعذّر الاتصال — تأكد أن البرنامج مفتوح
              </span>
            ) : (
              <Loader2 className="size-6 animate-spin text-primary" />
            )}
          </div>
        )}

        {active && (
          <div className="absolute top-2 right-2 rounded-md bg-primary/90 px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
            تحكم مفتوح
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
        <Button
          size="sm"
          variant={controlling ? "default" : "outline"}
          className="flex-1"
          disabled={!live}
          title={canControl ? undefined : "الجهاز يحتاج تحديث البرنامج لدعم التحكم"}
          onClick={() => {
            if (!canControl) {
              toast.error("التحكم غير متاح — حدّث برنامج الموظف");
              return;
            }
            setControlling((v) => !v);
          }}
        >
          <MousePointerClick className="size-4 ml-1" />
          {controlling ? "إيقاف التحكم" : "تحكم"}
        </Button>
      </div>


    </div>
  );
}

export function PairDeviceBox({
  employeeName,
  title,
}: { userId?: string; employeeName?: string | null; title?: string } = {}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("agent_create_enroll_code", {
      p_employee_name: (employeeName ?? "").trim() || undefined,
    });
    setBusy(false);
    if (error || typeof data !== "string") return toast.error("تعذّر إنشاء كود التسجيل");
    setIssued(data);
    toast.success("تم إنشاء كود التسجيل — سلّمه للموظف");
    void qc.invalidateQueries({ queryKey: ["agent-devices"] });
  };

  return (
    <div className="rounded-xl border border-border/60 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-primary" />
        <span className="text-sm font-bold">{title ?? "كود تسجيل جهاز موظف"}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        الموظف لا يستطيع تسجيل البرنامج إلا بكود تصدره أنت من هنا. الكود يُستخدم لمرة واحدة فقط.
      </p>
      {issued && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
          <span className="font-mono text-lg font-black tracking-widest" dir="ltr">
            {issued}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(issued);
              toast.success("تم نسخ الكود");
            }}
          >
            نسخ
          </Button>
        </div>
      )}
      <Button onClick={() => void generate()} disabled={busy} className="w-full">
        {busy ? <Loader2 className="size-4 animate-spin" /> : "إنشاء كود تسجيل جديد"}
      </Button>
    </div>
  );
}


const DEVICE_COLUMNS =
  "id, device_id, employee_name, device_label, os, approved, last_seen_at, created_at, user_id, app_version";

function useAgentDevices() {
  return useQuery({
    queryKey: ["agent-devices"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_devices")
        .select(DEVICE_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Device[];
    },
  });
}

function useRemoveDevice(onRemoved?: (id: string) => void) {
  const qc = useQueryClient();
  return async (d: Device) => {
    const { error } = await supabase.from("agent_devices").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    onRemoved?.(d.id);
    toast.success("تم إلغاء تسجيل الجهاز — سيظهر للموظف مفتاح ربط جديد");
    void qc.invalidateQueries({ queryKey: ["agent-devices"] });
  };
}

/** أجهزة موظف واحد — بيانات ومفاتيح فقط (بدون شاشة بث؛ البث في قسم الوصول عن بعد) */
export function EmployeeDevices({
  userId,
  employeeName,
}: {
  userId: string;
  employeeName?: string | null;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useAgentDevices();
  const remove = useRemoveDevice();

  const all = data ?? [];
  const name = (employeeName ?? "").trim().toLowerCase();
  const mine = all.filter(
    (d) =>
      d.user_id === userId ||
      (!d.user_id && !!name && (d.employee_name ?? "").trim().toLowerCase() === name),
  );
  const unassigned = all.filter((d) => !d.user_id && !mine.includes(d));

  const assign = async (d: Device) => {
    const { error } = await supabase.from("agent_devices").update({ user_id: userId }).eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("تم ربط الجهاز بهذا الموظف");
    void qc.invalidateQueries({ queryKey: ["agent-devices"] });
  };

  return (
    <div className="space-y-3">
      <PairDeviceBox userId={userId} employeeName={employeeName} title="إنشاء كود تسجيل للموظف" />

      <div className="flex items-center gap-2">
        <Monitor className="size-4 text-primary" />
        <span className="text-sm font-bold">أجهزة الموظف</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : mine.length === 0 ? (
        <p className="text-xs text-muted-foreground">لا توجد أجهزة مربوطة بهذا الموظف بعد.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {mine.map((d) => (
            <div key={d.id} className="rounded-xl border border-border/60 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold truncate">
                  {d.device_label ?? d.employee_name ?? "جهاز"}
                </span>
                <Badge variant={isOnline(d) ? "default" : "secondary"} className="text-[10px]">
                  {isOnline(d) ? "متصل" : "غير متصل"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{d.os ?? "—"}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <KeyRound className="size-3" />
                <span dir="ltr" className="truncate">{d.device_id}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                إصدار البرنامج: <span dir="ltr">{d.app_version ? "v" + d.app_version : "—"}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                الحالة: {d.approved ? "مصرّح له" : "غير مصرّح"}
              </p>
              <p className="text-xs text-muted-foreground">
                آخر ظهور: {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString("ar-EG") : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                أُضيف: {new Date(d.created_at).toLocaleDateString("ar-EG")}
              </p>
              <Button size="sm" variant="outline" onClick={() => void remove(d)}>
                <Trash2 className="size-3.5 me-1" /> إلغاء التسجيل
              </Button>
            </div>
          ))}
        </div>
      )}



      {unassigned.length > 0 && (
        <div className="rounded-xl border border-border/60 p-3 space-y-2">
          <span className="text-xs font-bold">أجهزة غير مربوطة بموظف</span>
          {unassigned.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">
                {d.employee_name ?? "جهاز"} — <span dir="ltr">{d.device_id.slice(0, 12)}</span>
              </span>
              <Button size="sm" variant="outline" onClick={() => void assign(d)}>
                ربط بهذا الموظف
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DeviceMonitorGrid({ screensOnly = false }: { screensOnly?: boolean } = {}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // زيادة هذا الرقم تعيد بناء كل اتصالات البث من الصفر
  const [reloadKey, setReloadKey] = useState(0);
  const { data, isLoading, refetch, isFetching } = useAgentDevices();
  const removeDevice = useRemoveDevice((id) => {
    setExpandedId((cur) => (cur === id ? null : cur));
  });


  const handleRefresh = async () => {
    setReloadKey((n) => n + 1);
    await refetch();
    toast.success("تم تحديث الأجهزة وإعادة تشغيل البث");
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
        <Button variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={isFetching}>
          <RefreshCw className={`size-4 ml-1 ${isFetching ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      {!expandedId && !screensOnly && <PairDeviceBox />}


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
        <div className={expandedId ? "" : "grid gap-3 grid-cols-2 items-stretch"}>
          {shown.map((d, index) => (
            <LiveScreen
              key={`${d.id}:${reloadKey}`}
              device={d}
              online={isOnline(d)}
              startupDelay={expandedId ? 0 : Math.min(index * 140, 840)}
              expanded={expandedId === d.id}
              onToggleExpand={() => setExpandedId(expandedId === d.id ? null : d.id)}
              onRemove={() => {
                if (confirm(`حذف شاشة ${d.employee_name ?? "الجهاز"}؟`)) void removeDevice(d);
              }}
            />

          ))}
        </div>
      )}
    </div>
  );
}

