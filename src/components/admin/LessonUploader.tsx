import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, X, CheckCircle2, RotateCcw, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { uploadManager } from "@/lib/upload-manager";

// مسار التخزين لازم يكون ASCII فقط (Storage يرفض الحروف العربية)
function asciiSlug(name: string) {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "video";
}

function hashName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h.toString(36);
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
  const all = useSyncExternalStore(uploadManager.subscribe, uploadManager.getSnapshot, () => []);
  const items = all.filter((i) => i.courseId === courseId);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [lessonTitle, setLessonTitle] = useState("");
  const orderRef = useRef(startOrder);
  orderRef.current = Math.max(orderRef.current, startOrder);
  const nextOrder = () => orderRef.current++;

  useEffect(() => {
    const off = uploadManager.onLessonAdded((cid) => {
      if (cid === courseId) onUploaded();
    });
    return () => {
      off();
    };
  }, [courseId, onUploaded]);


  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    let added = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("video/")) {
        toast.error(`${file.name}: الملف ليس فيديو`);
        continue;
      }
      const rawExt = file.name.split(".").pop()?.toLowerCase() || "mp4";
      const ext = /^[a-z0-9]{2,5}$/.test(rawExt) ? rawExt : "mp4";
      // مسار ثابت بحروف ASCII فقط → يسمح باستكمال الرفع من نفس النقطة
      const objectName = `${courseId}/${asciiSlug(file.name)}-${hashName(file.name)}-${file.size}.${ext}`;
      const base = lessonTitle.trim();
      const title = base ? (files.length > 1 ? `${base} ${added + 1}` : base) : undefined;
      uploadManager.add(courseId, file, objectName, nextOrder, title);
      added++;

    }
    if (added) setLessonTitle("");
    if (added) toast.success("بدأ الرفع — يكمل في الخلفية حتى لو أغلقت النافذة");
    if (inputRef.current) inputRef.current.value = "";
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
      <Input
        value={lessonTitle}
        onChange={(e) => setLessonTitle(e.target.value)}
        placeholder="اسم المحاضرة (اختياري — لو أكثر من ملف يتم ترقيمه)"
        className="h-9"
      />
      <Button onClick={() => inputRef.current?.click()} className="gradient-primary text-white w-full">
        <Upload className="size-4 ml-1" />
        تحميل فيديو (يمكن اختيار أكثر من ملف)
      </Button>
      {active > 0 && (
        <div className="text-[11px] text-muted-foreground text-center">
          {active} ملف قيد الرفع بالتوازي — الرفع يكمل في الخلفية حتى لو أغلقت النافذة
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {items.map((it) => (
            <div key={it.id} className="rounded-xl border border-border/40 p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{it.title}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{it.fileName}</div>
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
                      <Button size="icon" variant="ghost" className="size-7" onClick={() => uploadManager.pause(it.id)}>
                        <Pause className="size-3.5" />
                      </Button>
                    </>
                  )}
                  {(it.status === "paused" || it.status === "error") && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => uploadManager.resume(it.id, nextOrder)}
                    >
                      {it.status === "error" ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}
                    </Button>
                  )}
                  {it.status !== "done" && (
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => uploadManager.cancel(it.id)}>
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
