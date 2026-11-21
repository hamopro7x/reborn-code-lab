import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LessonUploader } from "@/components/admin/LessonUploader";
import { ChevronDown, ChevronUp, Trash2, Upload } from "lucide-react";

export function LessonsManager({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  return <LessonsManagerInner courseId={courseId} courseTitle={courseTitle} />;
}

function probeVideoDurationFromUrl(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (val: number | null) => { v.src = ""; resolve(val); };
    v.onloadedmetadata = () => {
      const d = v.duration;
      done(isFinite(d) && d > 0 ? Math.round(d) : null);
    };
    v.onerror = () => done(null);
    v.src = url;
    setTimeout(() => done(null), 15000);
  });
}

function probeVideoDurationFromFile(file: File): Promise<number | null> {
  const url = URL.createObjectURL(file);
  return probeVideoDurationFromUrl(url).finally(() => URL.revokeObjectURL(url)) as Promise<number | null>;
}

function LessonsManagerInner({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const lessons = useQuery({
    queryKey: ["admin-lessons", courseId],
    queryFn: async () => {
      const { data } = await supabase.from("course_lessons").select("*").eq("course_id", courseId).order("sort_order");
      return data ?? [];
    },
    enabled: open,
  });
  // Backfill missing durations for existing lessons
  useEffect(() => {
    if (!open || !lessons.data) return;
    const missing = lessons.data.filter((l: any) => !l.duration_sec && l.video_path);
    if (!missing.length) return;
    (async () => {
      let updated = false;
      for (const l of missing) {
        try {
          const { data: signed } = await supabase.storage.from("course-videos").createSignedUrl(l.video_path, 300);
          if (!signed?.signedUrl) continue;
          const dur = await probeVideoDurationFromUrl(signed.signedUrl);
          if (!dur) continue;
          await supabase.from("course_lessons").update({ duration_sec: dur }).eq("id", l.id);
          updated = true;
        } catch { /* ignore */ }
      }
      if (updated) {
        qc.invalidateQueries({ queryKey: ["admin-lessons", courseId] });
        qc.invalidateQueries({ queryKey: ["admin-courses"] });
      }
    })();
  }, [open, lessons.data, courseId, qc]);


  async function removeLesson(l: any) {
    if (!confirm("حذف المحاضرة؟")) return;
    await supabase.storage.from("course-videos").remove([l.video_path]);
    await supabase.from("course_lessons").delete().eq("id", l.id);
    qc.invalidateQueries({ queryKey: ["admin-lessons", courseId] });
  }

  async function moveLesson(index: number, dir: -1 | 1) {
    const arr = (lessons.data ?? []) as any[];
    const target = index + dir;
    if (target < 0 || target >= arr.length) return;
    const a = arr[index];
    const b = arr[target];
    const { error } = await supabase.from("course_lessons").upsert([
      { id: a.id, course_id: courseId, title: a.title, video_path: a.video_path, sort_order: target },
      { id: b.id, course_id: courseId, title: b.title, video_path: b.video_path, sort_order: index },
    ]);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["admin-lessons", courseId] });
  }

  async function updateLesson(id: string, patch: { title?: string; sort_order?: number }) {
    const { error } = await supabase.from("course_lessons").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["admin-lessons", courseId] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Upload className="size-4 ml-1" />محاضرات</Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>محاضرات: {courseTitle}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {(() => {
            const arr = (lessons.data ?? []) as Array<{ duration_sec: number | null }>;
            const totalSec = arr.reduce((s, l) => s + (l.duration_sec ?? 0), 0);
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const sec = Math.floor(totalSec % 60);
            const hoursText = h > 0 ? `${h} ساعة و${m} دقيقة` : m > 0 ? `${m} دقيقة و${sec} ثانية` : `${sec} ثانية`;
            return (
              <div className="grid grid-cols-2 gap-2">
                <div className="card-surface rounded-xl p-3 text-center">
                  <div className="text-[11px] text-muted-foreground">عدد المحاضرات</div>
                  <div className="text-lg font-bold tabular-nums">{arr.length}</div>
                </div>
                <div className="card-surface rounded-xl p-3 text-center">
                  <div className="text-[11px] text-muted-foreground">إجمالي المدة</div>
                  <div className="text-lg font-bold tabular-nums">{hoursText}</div>
                </div>
              </div>
            );
          })()}

          <div className="card-surface rounded-xl p-3 space-y-2">
            <div className="text-sm font-semibold">إضافة محاضرات جديدة</div>
            <LessonUploader
              courseId={courseId}
              startOrder={lessons.data?.length ?? 0}
              onUploaded={() => {
                qc.invalidateQueries({ queryKey: ["admin-lessons", courseId] });
                qc.invalidateQueries({ queryKey: ["admin-courses"] });
              }}
            />
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {lessons.data?.map((l: any, idx: number) => (
              <LessonRow
                key={l.id}
                lesson={l}
                index={idx}
                total={lessons.data.length}
                onSave={updateLesson}
                onMove={(dir) => moveLesson(idx, dir)}
                onDelete={() => removeLesson(l)}
              />
            ))}
            {!lessons.data?.length && <div className="text-center text-xs text-muted-foreground p-4">لا توجد محاضرات</div>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LessonRow({
  lesson,
  index,
  total,
  onSave,
  onMove,
  onDelete,
}: {
  lesson: any;
  index: number;
  total: number;
  onSave: (id: string, patch: { title?: string; sort_order?: number }) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(lesson.title ?? "");
  useEffect(() => { setTitle(lesson.title ?? ""); }, [lesson.title]);
  const dirty = title !== (lesson.title ?? "");
  return (
    <div className="flex items-center gap-2 p-2 rounded-xl border border-border/40">
      <span className="w-6 text-center text-xs text-muted-foreground tabular-nums">{index + 1}</span>
      <div className="flex flex-col gap-0.5">
        <Button size="icon" variant="ghost" className="size-6" disabled={index === 0} onClick={() => onMove(-1)} title="تحريك لأعلى">
          <ChevronUp className="size-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="size-6" disabled={index === total - 1} onClick={() => onMove(1)} title="تحريك لأسفل">
          <ChevronDown className="size-3.5" />
        </Button>
      </div>
      <Input className="flex-1 h-9" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اسم المحاضرة" />
      <Button size="sm" variant="outline" disabled={!dirty || !title.trim()} onClick={() => onSave(lesson.id, { title: title.trim() })}>حفظ</Button>
      <Button size="sm" variant="outline" onClick={onDelete}><Trash2 className="size-4 text-destructive" /></Button>
    </div>
  );
}
