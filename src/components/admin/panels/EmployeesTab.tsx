import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { formatLocaleDateTime } from "@/lib/format";
import { createEmployee, deleteEmployee, listEmployees, updateEmployeeAvatar, updateEmployee } from "@/lib/admin.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmployeeDevices } from "@/components/admin/DeviceMonitorGrid";
import { livePoll } from "@/lib/live-poll";
import { useAdminBack } from "@/components/admin/back-nav";
import { DevicesTab } from "@/components/admin/panels/DevicesTab";
import { Camera, Download, Loader2, MonitorSmartphone, Plus, Trash2 } from "lucide-react";

export function EmployeesTab() {
  const qc = useQueryClient();
  const list = useServerFn(listEmployees);
  const create = useServerFn(createEmployee);
  const del = useServerFn(deleteEmployee);
  const updAvatar = useServerFn(updateEmployeeAvatar);
  const q = useQuery({ queryKey: ["admin-employees"], queryFn: () => list() as Promise<any[]> });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const upd = useServerFn(updateEmployee);
  const [editing, setEditing] = useState<{ user_id: string; full_name: string; email: string; password: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [prof, setProf] = useState<{ user_id: string; full_name: string; email: string; password: string } | null>(null);

  async function saveProfile() {
    if (!prof) return;
    if (prof.full_name.trim().length < 2) return toast.error("اكتب اسم صحيح");
    if (prof.password && prof.password.length < 6) return toast.error("كلمة السر 6 أحرف على الأقل");
    setSavingEdit(true);
    try {
      await upd({ data: {
        user_id: prof.user_id,
        full_name: prof.full_name.trim(),
        email: prof.email.trim(),
        ...(prof.password ? { password: prof.password } : {}),
      } });
      toast.success("تم تحديث بيانات الموظف");
      setProf({ ...prof, password: "" });
      qc.invalidateQueries({ queryKey: ["admin-employees"] });
    } catch (e: any) { toast.error(e?.message ?? "خطأ"); }
    finally { setSavingEdit(false); }
  }

  async function saveEdit() {
    if (!editing) return;
    if (editing.full_name.trim().length < 2) return toast.error("اكتب اسم صحيح");
    if (editing.password && editing.password.length < 6) return toast.error("كلمة السر 6 أحرف على الأقل");
    setSavingEdit(true);
    try {
      await upd({ data: {
        user_id: editing.user_id,
        full_name: editing.full_name.trim(),
        email: editing.email.trim(),
        ...(editing.password ? { password: editing.password } : {}),
      } });
      toast.success("تم تحديث بيانات الموظف");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-employees"] });
    } catch (e: any) { toast.error(e?.message ?? "خطأ"); }
    finally { setSavingEdit(false); }
  }

  const latestAgent = useQuery({
    queryKey: ["agent-latest-version"],
    queryFn: async () => {
      const r = await fetch("/api/public/agent-version", { cache: "no-store" });
      if (!r.ok) return { version: null, notes: null };
      return (await r.json()) as { version: string | null; notes: string | null };
    },
    refetchInterval: livePoll(60_000),
  });


  async function onPickAvatar(userId: string, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("الملف يجب أن يكون صورة");
    if (file.size > 5 * 1024 * 1024) return toast.error("الحد الأقصى 5 ميجا");
    setUploadingId(userId);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true, contentType: file.type,
      });
      if (upErr) throw upErr;
      await updAvatar({ data: { user_id: userId, path } });
      toast.success("تم رفع الصورة");
      qc.invalidateQueries({ queryKey: ["admin-employees"] });
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الرفع");
    } finally {
      setUploadingId(null);
    }
  }

  async function submit() {
    if (!form.email || !form.password || !form.full_name) return toast.error("أكمل البيانات");
    if (form.password.length < 6) return toast.error("كلمة السر 6 أحرف على الأقل");
    try {
      await create({ data: form });
      toast.success("تم إضافة الموظف");
      setOpen(false); setForm({ email: "", password: "", full_name: "" });
      qc.invalidateQueries({ queryKey: ["admin-employees"] });
    } catch (e: any) { toast.error(e?.message ?? "خطأ"); }
  }
  async function remove(uid: string) {
    if (!confirm("حذف هذا المستخدم نهائياً؟")) return;
    try {
      await del({ data: { user_id: uid } });
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["admin-employees"] });
    } catch (e: any) { toast.error(e?.message ?? "خطأ"); }
  }

  const selected = (q.data ?? []).find((u: any) => u.user_id === expanded) ?? null;

  useEffect(() => {
    if (!selected) { setProf(null); return; }
    setProf((p) => (p && p.user_id === selected.user_id ? p : {
      user_id: selected.user_id,
      full_name: selected.full_name ?? "",
      email: selected.email ?? "",
      password: "",
    }));
  }, [selected?.user_id, selected]);

  useAdminBack(selected ? () => setExpanded(null) : null, [selected?.user_id]);

  if (selected) {
    const u: any = selected;
    return (
      <div className="space-y-4">

        <div className="card-surface rounded-2xl p-6 flex flex-col items-center text-center gap-3">
          <button
            type="button"
            onClick={() => fileRefs.current[u.user_id]?.click()}
            disabled={uploadingId === u.user_id}
            className="relative size-28 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 group border border-border hover:border-primary transition"
            title="تغيير الصورة"
          >
            {u.avatar_signed_url ? (
              <img src={u.avatar_signed_url} alt={u.full_name || u.email} className="size-full object-cover" />
            ) : (
              <span className="text-4xl font-bold text-muted-foreground">
                {(u.full_name || u.email || "?").trim().charAt(0).toUpperCase()}
              </span>
            )}
            <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
              {uploadingId === u.user_id
                ? <Loader2 className="size-5 text-white animate-spin" />
                : <Camera className="size-5 text-white" />}
            </span>
          </button>
          <input
            ref={(el) => { fileRefs.current[u.user_id] = el; }}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              onPickAvatar(u.user_id, f);
              e.target.value = "";
            }}
          />
          <div>
            <div className="text-lg font-bold">{u.full_name || u.email.split("@")[0]}</div>
          </div>

          <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role === "admin" ? "أدمن" : "موظف"}</Badge>
        </div>

        <div className="card-surface rounded-2xl p-4 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">البيانات الشخصية</h3>
              <div className="flex items-center gap-1">
                <Button size="sm" onClick={saveProfile} disabled={savingEdit} className="gradient-primary text-white">
                  {savingEdit ? <Loader2 className="size-4 animate-spin" /> : "حفظ"}
                </Button>
                {u.role !== "admin" && (
                  <Button size="icon" variant="ghost" onClick={() => { remove(u.user_id); setExpanded(null); }}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-border/60 p-4 text-right">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">الاسم كامل</div>
                  <Input value={prof?.full_name ?? ""} onChange={(e) => setProf({ ...(prof ?? { user_id: u.user_id, full_name: "", email: "", password: "" }), full_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">البريد الإلكتروني</div>
                  <Input type="email" dir="ltr" style={{ textAlign: "right" }} value={prof?.email ?? ""} onChange={(e) => setProf({ ...(prof ?? { user_id: u.user_id, full_name: "", email: "", password: "" }), email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">كلمة السر</div>
                  <Input type="password" placeholder="اتركها فاضية لو مش عايز تغييرها" value={prof?.password ?? ""} onChange={(e) => setProf({ ...(prof ?? { user_id: u.user_id, full_name: "", email: "", password: "" }), password: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">الصلاحية</div>
                  <div className="rounded-md bg-muted/60 border border-border/50 px-3 py-2.5 text-sm font-medium truncate">{u.role === "admin" ? "أدمن" : "موظف"}</div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">تاريخ الإضافة</div>
                  <div className="rounded-md bg-muted/60 border border-border/50 px-3 py-2.5 text-sm font-medium truncate">{formatLocaleDateTime(u.created_at, "ar-EG")}</div>
                </div>
              </div>
            </div>


          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="min-w-0 card-surface rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold">أجهزة الموظف</h3>
            <EmployeeDevices userId={u.user_id} employeeName={u.full_name} />
          </div>
          <div className="min-w-0 card-surface rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2"><MonitorSmartphone className="size-4 text-primary" /> تفعيل جهاز الموظف</h3>
            <DevicesTab userId={u.user_id} employeeName={u.full_name} />
          </div>
        </div>



        <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>تعديل بيانات الموظف</DialogTitle></DialogHeader>
            {editing && (
              <div className="space-y-3">
                <div><Label>الاسم الكامل</Label><Input value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} /></div>
                <div><Label>البريد الإلكتروني</Label><Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
                <div><Label>كلمة سر جديدة (اختياري)</Label><Input type="password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} placeholder="اتركها فاضية لو مش عايز تغييرها" /></div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={saveEdit} disabled={savingEdit} className="gradient-primary text-white">
                {savingEdit ? <Loader2 className="size-4 animate-spin" /> : "حفظ"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold">الموظفون</h2>
          <p className="text-xs text-muted-foreground">الموظف يقدر يدير الطلبات والمنتجات والمراجعات — بدون طرق الدفع والعملات والإعدادات</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col items-end gap-1">
            <a
              href="/api/public/agent-download.exe"
              download={`MagProAgent-Setup${latestAgent.data?.version ? `-${latestAgent.data.version}` : ""}.exe`}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
              title="ينزّل دائمًا أحدث إصدار منشور تلقائيًا"
            >
              <Download className="size-4" />
              تنزيل برنامج الموظف
              {latestAgent.data?.version ? ` (v${latestAgent.data.version})` : " (أحدث نسخة)"}
            </a>
            {latestAgent.data?.version && (
              <span className="text-[11px] text-muted-foreground">
                آخر إصدار: v{latestAgent.data.version}
                {latestAgent.data.notes ? ` — ${latestAgent.data.notes}` : ""}
              </span>
            )}
          </div>

          <Button onClick={() => setOpen(true)} className="gradient-primary text-white gap-1"><Plus className="size-4" />موظف جديد</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(q.data ?? []).map((u: any) => (
          <div key={u.user_id + u.role} className="card-surface rounded-2xl p-4">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <div className="relative size-14 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border">
                {u.avatar_signed_url ? (
                  <img src={u.avatar_signed_url} alt={u.full_name || u.email} className="size-full object-cover" />
                ) : (
                  <span className="text-lg font-bold text-muted-foreground">
                    {(u.full_name || u.email || "?").trim().charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="font-bold truncate">{u.full_name || u.email.split("@")[0]}</div>
                  <Badge variant={u.role === "admin" ? "default" : "secondary"} className="shrink-0">{u.role === "admin" ? "أدمن" : "موظف"}</Badge>
                </div>
                
                <div className="text-[10px] text-muted-foreground">مُضاف: {new Date(u.created_at).toLocaleDateString("ar-EG")}</div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 rounded-full"
                  onClick={() => setExpanded(u.user_id)}
                >
                  عرض كل البيانات
                </Button>
              </div>
            </div>
          </div>
        ))}
        {(q.data ?? []).length === 0 && <div className="card-surface rounded-2xl p-12 text-center text-muted-foreground col-span-full">لا يوجد موظفون</div>}
      </div>


      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>تعديل بيانات الموظف</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>الاسم الكامل</Label><Input value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} /></div>
              <div><Label>البريد الإلكتروني</Label><Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              <div><Label>كلمة سر جديدة (اختياري)</Label><Input type="password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} placeholder="اتركها فاضية لو مش عايز تغييرها" /></div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={saveEdit} disabled={savingEdit} className="gradient-primary text-white">
              {savingEdit ? <Loader2 className="size-4 animate-spin" /> : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>إضافة موظف جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>الاسم الكامل</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label>البريد الإلكتروني</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>كلمة السر (6+ أحرف)</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
              الموظف يقدر: يؤكد الطلبات ويرفضها، يدير المنتجات، يوافق على المراجعات.<br />
              الموظف لا يقدر: يعدل طرق الدفع، العملات، الإعدادات، أو يضيف موظفين.
            </div>
          </div>
          <DialogFooter><Button onClick={submit} className="gradient-primary text-white">إضافة</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
