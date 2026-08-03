import { useCallback, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, X, CheckCircle2, RotateCcw, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";

type ItemStatus = "queued" | "uploading" | "paused" | "done" | "error";

type Item = {
  id: string;
  file: File;
  objectName: string;
  progress: number;
  sent: number;
  total: number;
  speed: string;
  status: ItemStatus;
  error?: string;
};

function slug(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "video";
}

function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (val: number | null) => {
      URL.revokeObjectURL(url);
      resolve(val);
    };
    v.onloadedmetadata = () => done(isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration) : null);
    v.onerror = () => done(null);
    v.src = url;
    setTimeout(() => done(null), 15000);
  });
}

export function LessonUploader({
  courseId,
  startOrder,
  onUploaded,
}: {
  courseId: string;
  startOrder: number;
  onUploaded: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const uploadsRef = useRef<Map<string, tus.Upload>>(new Map());
  const inputRef = useRef<HTMLInputElement | null>(null);
  const orderRef = useRef(startOrder);

  const patch = useCallback((id: string, p: Partial<Item>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  const startUpload = useCallback(
    async (item: Item) => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      if (!token || !baseUrl) {
        patch(item.id, { status: "error", error: "الجلسة غير صالحة — أعد تسجيل الدخول" });
        return;
      }

      const startedAt = Date.now();
      let startBytes = 0;

      const upload = new tus.Upload(item.file, {
        endpoint: `${baseUrl}/storage/v1/upload/resumable`,
        retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
        chunkSize: 6 * 1024 * 1024,
        parallelUploads: 1,
        removeFingerprintOnSuccess: true,
        uploadDataDuringCreation: true,
        headers: {
          authorization: `Bearer ${token}`,
          "x-upsert": "true",
        },
        metadata: {
          bucketName: "course-videos",
          objectName: item.objectName,
          contentType: item.file.type || "video/mp4",
          cacheControl: "3600",
        },
        onError: (err) => {
          patch(item.id, { status: "error", error: err?.message || "فشل الرفع" });
        },
        onProgress: (sent, total) => {
          if (!startBytes) startBytes = sent;
          const secs = Math.max(0.5, (Date.now() - startedAt) / 1000);
          const mbps = Math.max(0, (sent - startBytes) / 1024 / 1024) / secs;
          patch(item.id, {
            status: "uploading",
            sent,
            total,
            progress: total ? Math.round((sent / total) * 100) : 0,
            speed: `${mbps.toFixed(2)} MB/s`,
          });
        },
        onSuccess: async () => {
          patch(item.id, { status: "done", progress: 100 });
          const duration = await probeDuration(item.file);
          const { error } = await supabase.from("course_lessons").insert({
            course_id: courseId,
            title: slug(item.file.name).replace(/-/g, " "),
            video_path: item.objectName,
            sort_order: orderRef.current++,
            duration_sec: duration,
          });
          if (error) {
            patch(item.id, { status: "error", error: error.message });
            return;
          }
          onUploaded();
        },
      });

      uploadsRef.current.set(item.id, upload);
      const previous = await upload.findPreviousUploads();
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
      patch(item.id, { status: "uploading" });
    },
    [courseId, onUploaded, patch],
  );

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const next: Item[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("video/")) {
        toast.error(`${file.name}: الملف ليس فيديو`);
        continue;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
      next.push({
        id: crypto.randomUUID(),
        file,
        // deterministic path → يسمح باستكمال الرفع من نفس النقطة لو اتوقف
        objectName: `${courseId}/${slug(file.name)}-${file.size}.${ext}`,
        progress: 0,
        sent: 0,
        total: file.size,
        speed: "",
        status: "queued",
      });
    }
    if (!next.length) return;
    setItems((prev) => [...prev, ...next]);
    // رفع متوازي: كل الملفات تبدأ في نفس الوقت
    next.forEach((it) => void startUpload(it));
    if (inputRef.current) inputRef.current.value = "";
  }

  function pause(item: Item) {
    const up = uploadsRef.current.get(item.id);
    void up?.abort();
    patch(item.id, { status: "paused" });
  }
  function resume(item: Item) {
    void startUpload(item);
  }
  function cancel(item: Item) {
    const up = uploadsRef.current.get(item.id);
    void up?.abort(true);
    uploadsRef.current.delete(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  const active = items.filter((i) => i.status === "uploading").length;

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
      <Button onClick={() => inputRef.current?.click()} className="gradient-primary text-white w-full">
        <Upload className="size-4 ml-1" />
        تحميل فيديو (يمكن اختيار أكثر من ملف)
      </Button>
      {active > 0 && (
        <div className="text-[11px] text-muted-foreground text-center">
          {active} ملف قيد الرفع بالتوازي — الرفع يستكمل من نقطة التوقف تلقائياً
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {items.map((it) => (
            <div key={it.id} className="rounded-xl border border-border/40 p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{it.file.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {(it.sent / 1024 / 1024).toFixed(1)} / {(it.total / 1024 / 1024).toFixed(1)} MB
                    {it.speed && it.status === "uploading" ? ` — ${it.speed}` : ""}
                    {it.error ? ` — ${it.error}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {it.status === "done" && <CheckCircle2 className="size-4 text-primary" />}
                  {it.status === "uploading" && (
                    <>
                      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                      <Button size="icon" variant="ghost" className="size-7" onClick={() => pause(it)}>
                        <Pause className="size-3.5" />
                      </Button>
                    </>
                  )}
                  {(it.status === "paused" || it.status === "error") && (
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => resume(it)}>
                      {it.status === "error" ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}
                    </Button>
                  )}
                  {it.status !== "done" && (
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => cancel(it)}>
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={it.progress} className="h-2 flex-1" />
                <span className="text-[11px] font-semibold w-10 text-end tabular-nums">{it.progress}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
