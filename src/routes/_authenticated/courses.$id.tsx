import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getLessonVideoUrl, getViewerIdentity } from "@/lib/courses.functions";
import { getCachedFingerprint } from "@/lib/device-session";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, PlayCircle, ShieldAlert, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/courses/$id")({ component: CourseView });

function CourseView() {
  const { id } = Route.useParams();
  const [fp, setFp] = useState<string | null>(null);
  const identityFn = useServerFn(getViewerIdentity);
  const [viewer, setViewer] = useState<{ email: string; full_name: string } | null>(null);

  useEffect(() => {
    (async () => {
      const fingerprint = await getCachedFingerprint();
      setFp(fingerprint);
      identityFn().then(setViewer).catch(() => {});
    })();
  }, [identityFn]);

  const course = useQuery({
    queryKey: ["course", id],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*").eq("id", id).maybeSingle();
      return data;
    },
    enabled: !!fp,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  const lessons = useQuery({
    queryKey: ["course-lessons", id],
    queryFn: async () => {
      const { data } = await supabase.from("course_lessons").select("*").eq("course_id", id).order("sort_order");
      return data ?? [];
    },
    enabled: !!fp,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  useEffect(() => {
    if (lessons.data?.length && !activeLessonId) setActiveLessonId(lessons.data[0].id);
  }, [lessons.data, activeLessonId]);

  const qc = useQueryClient();
  const getUrlFn = useServerFn(getLessonVideoUrl);
  const prefetchLesson = (lessonId: string) => {
    if (!fp) return;
    qc.prefetchQuery({
      queryKey: ["lesson-url", lessonId, fp],
      queryFn: async () => {
        const res: any = await getUrlFn({ data: { lesson_id: lessonId, fingerprint: fp } });
        return res.url as string;
      },
      staleTime: 4 * 60_000,
    });
  };
  const releaseVideoBeforeLeave = () => {
    document.querySelectorAll("video").forEach((video) => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    });
  };

  if (!fp || course.isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;

  if (!course.data) return (
    <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
      <div className="card-surface rounded-2xl p-8 max-w-md text-center space-y-3">
        <ShieldAlert className="size-14 mx-auto text-destructive" />
        <h1 className="text-xl font-bold">لا تملك صلاحية الوصول لهذا الكورس</h1>
        <p className="text-sm text-muted-foreground">تواصل مع الإدارة لطلب الصلاحية.</p>
        <Link to="/admin" search={{ panel: "courses" }} preload={false} onClick={releaseVideoBeforeLeave}><Button variant="outline">العودة</Button></Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen p-4 md:p-6" dir="rtl">
      <div className="max-w-[1800px] mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Link to="/admin" search={{ panel: "courses" }} preload={false} onClick={releaseVideoBeforeLeave} className="shrink-0 mt-0.5">
              <Button variant="outline" size="sm" aria-label="العودة">
                <ArrowRight className="size-4" /> العودة
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold truncate">{course.data?.title}</h1>
              {course.data?.description && <p className="text-sm text-muted-foreground mt-1">{course.data.description}</p>}
            </div>
          </div>
          <div className="text-xs text-muted-foreground shrink-0">مرحباً {viewer?.full_name || viewer?.email}</div>
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          <div>
            {activeLessonId && (
              <ProtectedPlayer lessonId={activeLessonId} fingerprint={fp} watermark={viewer?.email || viewer?.full_name || "employee"} />
            )}
          </div>
          {!!lessons.data?.length && (
            <div className="card-surface rounded-2xl p-3 space-y-1 h-fit">
              {lessons.data.map((l: any, i: number) => (
                <button key={l.id} onClick={() => setActiveLessonId(l.id)}
                  onMouseEnter={() => prefetchLesson(l.id)}
                  onFocus={() => prefetchLesson(l.id)}
                  onTouchStart={() => prefetchLesson(l.id)}
                  className={`w-full text-right p-2 rounded-xl flex items-center gap-2 text-base transition-colors ${activeLessonId === l.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                  <PlayCircle className="size-5 shrink-0" />
                  <span className="truncate">{i + 1}. {l.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProtectedPlayer({ lessonId, fingerprint, watermark }: { lessonId: string; fingerprint: string; watermark: string }) {
  const getUrlFn = useServerFn(getLessonVideoUrl);
  const qc = useQueryClient();
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [obscured, setObscured] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setErr(null);
    const cached = qc.getQueryData<string>(["lesson-url", lessonId, fingerprint]);
    if (cached) { setUrl(cached); return; }
    setUrl(null);
    let cancelled = false;
    (async () => {
      try {
        const u = await qc.fetchQuery({
          queryKey: ["lesson-url", lessonId, fingerprint],
          queryFn: async () => {
            const res: any = await getUrlFn({ data: { lesson_id: lessonId, fingerprint } });
            return res.url as string;
          },
          staleTime: 4 * 60_000,
        });
        if (!cancelled) setUrl(u);
      } catch (e: any) {
        if (cancelled) return;
        const m = String(e?.message || e);
        setErr(m.includes("DEVICE_NOT_TRUSTED") ? "هذا الجهاز غير مصرّح له بتشغيل الفيديو." : "تعذّر تحميل الفيديو.");
      }
    })();
    return () => { cancelled = true; };
  }, [lessonId, fingerprint, getUrlFn, qc]);

  // Anti-capture deterrents: pause + blur when tab hidden / window blurred / PrintScreen pressed
  useEffect(() => {
    const pauseAndHide = () => {
      const v = videoRef.current;
      if (v && !v.paused) v.pause();
      setObscured(true);
    };
    const reveal = () => setObscured(false);
    const onVis = () => { if (document.hidden) pauseAndHide(); else reveal(); };
    const onBlur = () => pauseAndHide();
    const onFocus = () => reveal();
    const onKey = (e: KeyboardEvent) => {
      // PrintScreen / Win+Shift+S / Ctrl+P / Ctrl+Shift+S
      if (e.key === "PrintScreen" || (e.ctrlKey && (e.key === "p" || e.key === "P")) || (e.ctrlKey && e.shiftKey && (e.key === "s" || e.key === "S"))) {
        pauseAndHide();
        setTimeout(reveal, 2500);
      }
    };
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("keyup", onKey);
    document.addEventListener("copy", onCopy);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keyup", onKey);
      document.removeEventListener("copy", onCopy);
    };
  }, []);

  if (err) return (
    <div className="card-surface rounded-2xl p-10 text-center">
      <ShieldAlert className="size-10 mx-auto text-destructive mb-2" />
      <p className="text-sm">{err}</p>
    </div>
  );
  if (!url) return <div className="card-surface rounded-2xl aspect-video flex items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;

  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-black select-none"
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <video
        ref={videoRef}
        src={url}
        controls
        preload="auto"
        controlsList="nodownload noremoteplayback noplaybackrate"
        disablePictureInPicture
        disableRemotePlayback
        playsInline
        className={`w-full aspect-video transition-all duration-200 ${obscured ? "blur-2xl opacity-20" : ""}`}
        onContextMenu={(e) => e.preventDefault()}
      />
      {/* Moving watermark overlay */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="wm-float absolute text-white/25 text-sm font-mono whitespace-nowrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {watermark}
        </div>
      </div>
      {obscured && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md text-center p-6 z-10">
          <div className="space-y-2">
            <ShieldAlert className="size-10 mx-auto text-destructive" />
            <p className="text-sm font-bold text-white">تم إيقاف العرض مؤقتاً</p>
            <p className="text-[11px] text-white/70">التقاط الشاشة أو تسجيلها ممنوع — العودة للنافذة لاستئناف التشغيل.</p>
          </div>
        </div>
      )}
      <div className="absolute top-2 left-2 flex items-center gap-1 text-[10px] text-white/60 bg-black/40 px-2 py-0.5 rounded">
        <CheckCircle2 className="size-3" /> محمي
      </div>
    </div>
  );
}