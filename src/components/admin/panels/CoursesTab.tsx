import { useEffect, useRef, useState } from "react";
import { LessonsManager } from "@/components/admin/panels/CourseLessonsManager";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { checkDevice, getViewerIdentity } from "@/lib/courses.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Clock, Edit, Image as ImageIcon, Loader2, PlayCircle, Plus, ShieldAlert, Trash2, Upload, X } from "lucide-react";

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

// ============ DEVICES ============
