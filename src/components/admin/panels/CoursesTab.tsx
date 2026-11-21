import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { adminListCourseAccess, adminGrantCourseAccess, adminRevokeCourseAccess, checkDevice, getViewerIdentity } from "@/lib/courses.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { LessonUploader } from "@/components/admin/LessonUploader";
import { ChevronDown, ChevronUp, Clock, Edit, Image as ImageIcon, Loader2, Lock, PlayCircle, Plus, ShieldAlert, Trash2, Upload } from "lucide-react";

export function CoursesTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const checkFn = useServerFn(checkDevice);
  const identityFn = useServerFn(getViewerIdentity);
  const [deviceState, setDeviceState] = useState<"checking" | "ok" | "blocked">(isAdmin ? "ok" : "checking");
  const [myFp, setMyFp] = useState<string>("");
  const [viewer, setViewer] = useState<{ email: string; full_name: string; avatar_url: string } | null>(null);
  useEffect(() => {
    (async () => {
      try {
        if (isAdmin) return;
        identityFn().then(setViewer).catch(() => {});
        const { ensureDeviceChecked } = await import("@/lib/device-session");
        const { ok, fingerprint } = await ensureDeviceChecked(checkFn as any);
        setMyFp(fingerprint);
        setDeviceState(ok ? "ok" : "blocked");
      } catch { setDeviceState("blocked"); }
    })();
  }, [isAdmin, checkFn, identityFn]);
  const courses = useQuery({
    queryKey: ["admin-courses"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*, course_lessons(id,duration_sec)").order("sort_order").order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: deviceState === "ok",
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ title: "", description: "", cover_url: "", sort_order: 0, is_published: true });
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);

  function startNew() { setEditing(null); setForm({ title: "", description: "", cover_url: "", sort_order: 0, is_published: true }); setOpen(true); }
  function startEdit(c: any) { setEditing(c); setForm({ title: c.title, description: c.description ?? "", cover_url: c.cover_url ?? "", sort_order: c.sort_order, is_published: c.is_published }); setOpen(true); }

  async function save() {
    if (!form.title.trim()) { toast.error("العنوان مطلوب"); return; }
    const payload = { ...form, description: form.description || null, cover_url: form.cover_url || null };
    if (editing) {
      const { error } = await supabase.from("courses").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("courses").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("تم الحفظ");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-courses"] });
  }
  async function remove(c: any) {
    if (!confirm(`حذف الكورس "${c.title}"؟`)) return;
    const { error } = await supabase.from("courses").delete().eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["admin-courses"] });
  }

  if (deviceState === "checking") return (
    <div className="flex items-center justify-center py-20"><Loader2 className="size-8 animate-spin text-primary" /></div>
  );
  if (deviceState === "blocked") return (
    <div className="flex items-center justify-center py-10" dir="rtl">
      <div className="card-surface rounded-2xl p-8 max-w-md text-center space-y-3">
        <ShieldAlert className="size-14 mx-auto text-destructive" />
        <h1 className="text-xl font-bold">محتوى محمي</h1>
        <p className="text-sm text-muted-foreground">هذا الجهاز غير مسجّل. أرسل معرّف الجهاز التالي للإدارة لتفعيله:</p>
        <div className="p-2 rounded-xl bg-muted/50 font-mono text-[10px] break-all select-all">{myFp}</div>
        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(myFp); toast.success("تم نسخ المعرّف"); }}>نسخ المعرّف</Button>
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className={isAdmin ? "flex justify-end" : "flex justify-center"}>
        {isAdmin ? (
          <Button onClick={startNew} className="gradient-primary text-primary-foreground shrink-0"><Plus className="size-4 ml-1" />كورس جديد</Button>
        ) : (
          <div className="flex flex-col items-center text-center gap-3">
            <div className="relative shrink-0">
              <div className="size-20 md:size-24 rounded-full gradient-primary ring-4 ring-background flex items-center justify-center overflow-hidden shadow-lg">
                {viewer?.avatar_url ? (
                  <img src={viewer.avatar_url} alt={viewer?.full_name || "avatar"} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl md:text-3xl font-black text-primary-foreground">{((viewer?.full_name || viewer?.email || "?")[0] || "?").toUpperCase()}</span>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <h2 className="text-xl md:text-2xl font-black">
                <span className="text-muted-foreground">موظف :</span>{' '}
                <span className="text-gradient">{viewer?.full_name || viewer?.email?.split("@")[0] || "—"}</span>
              </h2>
              <p className="text-xs text-muted-foreground">محتوى محمي — الفيديوهات تُعرض فقط للأجهزة المسجّلة.</p>
            </div>
          </div>
        )}
      </div>

      {courses.isLoading ? <Loader2 className="animate-spin mx-auto" /> :
        !courses.data?.length ? <div className="card-surface p-8 text-center text-muted-foreground rounded-2xl">لا توجد كورسات بعد</div> :
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
          {courses.data.map((c: any) => {
            const lessonsArr = (c.course_lessons ?? []) as Array<{ id: string; duration_sec: number | null }>;
            const count = lessonsArr.length;
            const totalSec = lessonsArr.reduce((s, l) => s + (l.duration_sec ?? 0), 0);
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const s = Math.floor(totalSec % 60);
            const dur = totalSec ? (h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`) : "0:00";
            const prefetchCourse = () => {
              qc.prefetchQuery({
                queryKey: ["course", c.id],
                queryFn: async () => (await supabase.from("courses").select("*").eq("id", c.id).maybeSingle()).data,
                staleTime: 5 * 60_000,
              });
              qc.prefetchQuery({
                queryKey: ["course-lessons", c.id],
                queryFn: async () => (await supabase.from("course_lessons").select("*").eq("course_id", c.id).order("sort_order")).data ?? [],
                staleTime: 5 * 60_000,
              });
            };
            return (
              <div key={c.id}
                onMouseEnter={prefetchCourse}
                onTouchStart={prefetchCourse}
                className="bg-card border border-border/60 rounded-2xl overflow-hidden flex flex-col p-2 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all">
                <Link to="/courses/$id" params={{ id: c.id }} className="block group">
                  <div className="relative aspect-[16/10] bg-black overflow-hidden rounded-xl">
                    {c.cover_url ? (
                      <img src={c.cover_url} alt={c.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    ) : (
                      <div className="w-full h-full gradient-primary flex items-center justify-center"><PlayCircle className="size-12 text-white/70" /></div>
                    )}
                    {!c.is_published && <Badge variant="outline" className="absolute top-2 right-2 bg-background/80 backdrop-blur">مسودة</Badge>}
                  </div>
                </Link>
                <div className="px-2 pt-3 pb-2 flex flex-col gap-3 flex-1">
                  <h3 className="text-sm md:text-base font-bold line-clamp-2 text-center leading-snug">{c.title}</h3>
                  <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                    <span className="inline-flex items-center gap-1.5">
                      <span>{count} محاضرة</span>
                      <PlayCircle className="size-3.5" />
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span>{dur}</span>
                      <Clock className="size-3.5" />
                    </span>
                  </div>
                  <div className="mt-auto pt-1 space-y-2">
                    <Link to="/courses/$id" params={{ id: c.id }} className="block">
                      <Button variant="outline" size="sm" className="w-full rounded-full h-10 text-primary border-primary/50 hover:bg-primary hover:text-primary-foreground font-bold">
                        دخول
                      </Button>
                    </Link>
                    {isAdmin && (
                      <div className="flex gap-1.5 flex-wrap justify-center">
                       <LessonsManager courseId={c.id} courseTitle={c.title} />
                        <Button size="sm" variant="outline" onClick={() => startEdit(c)}><Edit className="size-4" /></Button>
                        <Button size="sm" variant="outline" onClick={() => remove(c)}><Trash2 className="size-4 text-destructive" /></Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      }

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "تعديل كورس" : "كورس جديد"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>العنوان</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>الوصف</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>صورة الغلاف</Label>
              <div className="flex items-center gap-3">
                <div className="w-40 h-24 shrink-0 rounded-xl overflow-hidden border border-border/60 bg-muted/30 flex items-center justify-center">
                  {form.cover_url ? (
                    <img src={form.cover_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setCoverUploading(true);
                      try {
                        const ext = file.name.split(".").pop();
                        const path = `courses/${crypto.randomUUID()}.${ext}`;
                        const { error } = await supabase.storage.from("product-images").upload(path, file);
                        if (error) throw error;
                        const { data: signed, error: sErr } = await supabase.storage.from("product-images").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
                        if (sErr || !signed?.signedUrl) throw new Error(sErr?.message || "فشل توليد الرابط");
                        setForm((f: any) => ({ ...f, cover_url: signed.signedUrl }));
                        toast.success("تم رفع الصورة");
                      } catch (err: any) {
                        toast.error(err?.message ?? "فشل رفع الصورة");
                      } finally {
                        setCoverUploading(false);
                        if (coverInputRef.current) coverInputRef.current.value = "";
                      }
                    }}
                  />
                  <Button type="button" variant="outline" className="w-full" disabled={coverUploading} onClick={() => coverInputRef.current?.click()}>
                    {coverUploading ? <Loader2 className="size-4 animate-spin ml-1" /> : <Upload className="size-4 ml-1" />}
                    تحميل صورة
                  </Button>
                  {form.cover_url && (
                    <Button type="button" variant="ghost" size="sm" className="w-full text-destructive" onClick={() => setForm({ ...form, cover_url: "" })}>
                      <X className="size-3.5 ml-1" />إزالة الصورة
                    </Button>
                  )}
                  <p className="text-[10px] text-muted-foreground">المقاس المفضّل 1280×800 (16:10)</p>
                </div>
              </div>
            </div>
            <div><Label>الترتيب</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
            <label className="flex items-center gap-2"><Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} />منشور</label>
          </div>
          <DialogFooter><Button onClick={save} className="gradient-primary text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LessonsManager({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
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


function CourseAccessManager({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState("");
  const listAccessFn = useServerFn(adminListCourseAccess);
  const listEmpFn = useServerFn(adminListEmployees);
  const grantFn = useServerFn(adminGrantCourseAccess);
  const revokeFn = useServerFn(adminRevokeCourseAccess);

  const accessQ = useQuery({
    queryKey: ["course-access", courseId],
    queryFn: () => listAccessFn({ data: { course_id: courseId } }) as Promise<any[]>,
    enabled: open,
  });
  const empQ = useQuery({
    queryKey: ["admin-employees-for-access"],
    queryFn: () => listEmpFn() as Promise<any[]>,
    enabled: open,
  });

  const grantedIds = new Set((accessQ.data ?? []).map((a: any) => a.user_id));
  const available = (empQ.data ?? []).filter((e: any) => !grantedIds.has(e.id));

  async function grant() {
    if (!selectedUser) { toast.error("اختر موظف"); return; }
    try {
      await grantFn({ data: { course_id: courseId, user_id: selectedUser } });
      toast.success("تم منح الصلاحية");
      setSelectedUser("");
      qc.invalidateQueries({ queryKey: ["course-access", courseId] });
    } catch (e: any) { toast.error(e.message ?? "فشل"); }
  }
  async function revoke(id: string) {
    if (!confirm("إزالة الصلاحية؟")) return;
    try {
      await revokeFn({ data: { access_id: id } });
      toast.success("تمت الإزالة");
      qc.invalidateQueries({ queryKey: ["course-access", courseId] });
    } catch (e: any) { toast.error(e.message ?? "فشل"); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Lock className="size-4 ml-1" />صلاحيات</Button>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>صلاحيات الوصول: {courseTitle}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="card-surface rounded-xl p-3 space-y-2">
            <div className="text-sm font-semibold">إضافة موظف</div>
            <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— اختر موظف —</option>
              {available.map((e: any) => (
                <option key={e.id} value={e.id}>{e.full_name || e.email}</option>
              ))}
            </select>
            <Button onClick={grant} className="gradient-primary text-white w-full" disabled={!selectedUser}>
              <Plus className="size-4 ml-1" />منح الصلاحية
            </Button>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            <div className="text-sm font-semibold">المصرح لهم ({accessQ.data?.length ?? 0})</div>
            {accessQ.data?.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between gap-2 p-2 rounded-xl border border-border/40">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{a.full_name || "—"}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{a.email}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => revoke(a.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            ))}
            {!accessQ.data?.length && <div className="text-center text-xs text-muted-foreground p-4">لم يتم منح صلاحية لأحد</div>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ DEVICES ============
