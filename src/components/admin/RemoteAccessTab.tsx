import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Edit, ExternalLink, Copy, MonitorPlay, Loader2 } from "lucide-react";
import { AgentDownloadCard } from "./AgentDownloadCard";

type RemoteRow = {
  id: string;
  employee_name: string;
  device_label: string | null;
  remote_url: string;
  access_code: string | null;
  notes: string | null;
  is_active: boolean;
  last_connected_at: string | null;
  created_at: string;
};

const emptyForm = {
  employee_name: "",
  device_label: "",
  remote_url: "",
  access_code: "",
  notes: "",
  is_active: true,
};

// RustDesk web client يدعم العرض داخل الموقع، وبيقبل ID الجهاز أو رابط جلسة كامل
const RUSTDESK_WEB = "https://rustdesk.com/web/";
const viewerUrl = (row: RemoteRow) => {
  const v = (row.remote_url ?? "").trim();
  if (/^https?:\/\//i.test(v)) return v;
  const id = v.replace(/\s+/g, "");
  return id ? `${RUSTDESK_WEB}#/connect/${encodeURIComponent(id)}` : RUSTDESK_WEB;
};


export function RemoteAccessTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RemoteRow | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState<RemoteRow | null>(null);
  const [frameBlocked, setFrameBlocked] = useState(false);


  const { data, isLoading } = useQuery({
    queryKey: ["remote-access"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remote_access")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RemoteRow[];
    },
  });

  const startAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  };

  const startEdit = (row: RemoteRow) => {
    setEditing(row);
    setForm({
      employee_name: row.employee_name,
      device_label: row.device_label ?? "",
      remote_url: row.remote_url,
      access_code: row.access_code ?? "",
      notes: row.notes ?? "",
      is_active: row.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.employee_name.trim() || !form.remote_url.trim()) {
      toast.error("اسم الموظف ورابط الجلسة مطلوبان");
      return;
    }
    setSaving(true);
    const payload = {
      employee_name: form.employee_name.trim(),
      device_label: form.device_label.trim() || null,
      remote_url: form.remote_url.trim(),
      access_code: form.access_code.trim() || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    };
    const { error } = editing
      ? await supabase.from("remote_access").update(payload).eq("id", editing.id)
      : await supabase.from("remote_access").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "تم التعديل" : "تمت الإضافة");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["remote-access"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("remote_access").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["remote-access"] });
  };

  const connect = async (row: RemoteRow) => {
    setSession(row);
    setFrameBlocked(false);
    await supabase
      .from("remote_access")
      .update({ last_connected_at: new Date().toISOString() })
      .eq("id", row.id);
    qc.invalidateQueries({ queryKey: ["remote-access"] });
  };



  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("تم نسخ كود الوصول");
  };

  if (session) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MonitorPlay className="size-5 text-primary" />
            <h2 className="text-lg font-bold">جلسة {session.employee_name}</h2>
            {session.device_label && (
              <span className="text-xs text-muted-foreground">{session.device_label}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {session.access_code && (
              <>
                <span className="font-mono text-xs text-muted-foreground">كود: {session.access_code}</span>
                <Button variant="ghost" size="icon" aria-label="نسخ الكود" onClick={() => copyCode(session.access_code!)}>
                  <Copy className="size-4" />
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => setFrameBlocked((v) => !v)}>
              {frameBlocked ? "إعادة العرض داخل الموقع" : "العرض مش ظاهر؟"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSession(null)}>
              رجوع للأجهزة
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border overflow-hidden bg-black/60 h-[calc(100vh-14rem)] min-h-[420px]">
          {!frameBlocked ? (
            <iframe
              key={session.id}
              src={viewerUrl(session)}
              title={`جلسة ${session.employee_name}`}
              className="w-full h-full"
              allow="clipboard-read; clipboard-write; fullscreen; microphone"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center p-6">
              <MonitorPlay className="size-12 text-primary" />
              <p className="text-sm font-semibold">مش قادر يعرض الجلسة جوه الموقع</p>
              <Button onClick={() => window.open(viewerUrl(session), "_blank", "noopener,noreferrer")}>
                <ExternalLink className="size-4 ml-1" /> فتح في تبويب جديد
              </Button>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          اكتب ID الجهاز في العارض ثم كلمة السر ({session.access_code ? "المسجّلة فوق" : "اللي عند الموظف"}) لبدء التحكم.
        </p>
      </div>
    );
  }

  return (

    <div className="space-y-6">
      <AgentDownloadCard />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">الوصول عن بُعد للموظفين</h2>
        <Button onClick={startAdd}><Plus className="size-4 ml-1" /> إضافة جهاز</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin" /></div>
      ) : !data?.length ? (
        <div className="card-surface rounded-2xl p-10 text-center text-muted-foreground">
          <MonitorPlay className="size-10 mx-auto mb-3 opacity-50" />
          لا توجد أجهزة مسجّلة بعد.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((row) => (
            <div key={row.id} className="card-surface rounded-2xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold truncate">{row.employee_name}</div>
                  {row.device_label && (
                    <div className="text-xs text-muted-foreground truncate">{row.device_label}</div>
                  )}
                </div>
                <Badge variant={row.is_active ? "default" : "secondary"}>
                  {row.is_active ? "مفعّل" : "موقوف"}
                </Badge>
              </div>

              {row.access_code && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">كود الوصول:</span>
                  <span className="font-mono">{row.access_code}</span>
                  <Button variant="ghost" size="icon" aria-label="نسخ كود الوصول" onClick={() => copyCode(row.access_code!)}>
                    <Copy className="size-4" />
                  </Button>
                </div>
              )}

              {row.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{row.notes}</p>}

              <div className="text-xs text-muted-foreground">
                آخر اتصال: {row.last_connected_at ? new Date(row.last_connected_at).toLocaleString("ar-EG") : "—"}
              </div>

              <div className="flex gap-2 pt-1">
                <Button size="sm" disabled={!row.is_active} onClick={() => connect(row)}>
                  <ExternalLink className="size-4 ml-1" /> اتصال
                </Button>
                <Button size="sm" variant="outline" aria-label="تعديل" onClick={() => startEdit(row)}>
                  <Edit className="size-4" />
                </Button>
                <Button size="sm" variant="outline" aria-label="حذف" onClick={() => remove(row.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}





      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل جهاز" : "إضافة جهاز"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>اسم الموظف *</Label>
              <Input value={form.employee_name} onChange={(e) => setForm({ ...form, employee_name: e.target.value })} />
            </div>
            <div>
              <Label>اسم الجهاز</Label>
              <Input placeholder="لابتوب المكتب" value={form.device_label} onChange={(e) => setForm({ ...form, device_label: e.target.value })} />
            </div>
            <div>
              <Label>RustDesk ID أو رابط جلسة *</Label>
              <Input dir="ltr" placeholder="123456789" value={form.remote_url} onChange={(e) => setForm({ ...form, remote_url: e.target.value })} />

            </div>
            <div>
              <Label>كود الوصول / PIN</Label>
              <Input dir="ltr" value={form.access_code} onChange={(e) => setForm({ ...form, access_code: e.target.value })} />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>مفعّل</Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin ml-1" />} حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
