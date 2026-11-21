import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatLocaleDateTime } from "@/lib/format";
import { adminListDevices, adminDeleteDevice, adminResetUserDevices, adminAddDevice, adminListEmployees } from "@/lib/courses.functions";

function DevicesTab({ userId, employeeName }: { userId?: string; employeeName?: string | null } = {}) {
  const scoped = !!userId;
  const qc = useQueryClient();
  const listFn = useServerFn(adminListDevices);
  const delFn = useServerFn(adminDeleteDevice);
  const resetFn = useServerFn(adminResetUserDevices);
  const addFn = useServerFn(adminAddDevice);
  const empFn = useServerFn(adminListEmployees);
  const devices = useQuery({ queryKey: ["admin-devices"], queryFn: () => listFn() });
  const employees = useQuery({ queryKey: ["admin-devices-employees"], queryFn: () => empFn(), enabled: !scoped });
  const [newUserId, setNewUserId] = useState<string>(userId ?? "");
  const [newFp, setNewFp] = useState<string>("");
  const [newLabel, setNewLabel] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [filterUser, setFilterUser] = useState<string>("");


  async function addDevice() {
    if (!newUserId || newFp.trim().length < 6) { toast.error("اختر موظف وأدخل معرّف الجهاز"); return; }
    setSaving(true);
    try {
      await addFn({ data: { user_id: newUserId, fingerprint: newFp.trim(), label: newLabel.trim() || undefined } });
      toast.success("تم تفعيل الجهاز");
      setNewFp(""); setNewLabel("");
      qc.invalidateQueries({ queryKey: ["admin-devices"] });
    } catch (e: any) { toast.error(e.message || "فشل"); }
    finally { setSaving(false); }
  }

  const grouped = new Map<string, any[]>();
  for (const d of (devices.data ?? []) as any[]) {
    if (scoped && d.user_id !== userId) continue;
    if (!grouped.has(d.user_id)) grouped.set(d.user_id, []);
    grouped.get(d.user_id)!.push(d);
  }
  const entries = Array.from(grouped.entries()).filter(([uid]) => !filterUser || uid === filterUser);


  return (
    <div className="space-y-4">
      <div className="card-surface rounded-2xl p-4 space-y-3">
        <div className="font-bold text-sm">
          {scoped ? `تفعيل جهاز جديد لـ ${employeeName || "هذا الموظف"}` : "تفعيل جهاز جديد لموظف"}
        </div>
        <p className="text-xs text-muted-foreground">اطلب من الموظف فتح صفحة الكورسات ونسخ معرّف الجهاز الظاهر له، ثم ألصقه هنا.</p>
        <div className={scoped ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 md:grid-cols-2 gap-3"}>
          {!scoped && (
            <div>
              <Label className="text-xs">الموظف</Label>
              <select value={newUserId} onChange={(e) => setNewUserId(e.target.value)} className="w-full h-10 rounded-xl border border-border/60 bg-background px-3 text-sm">
                <option value="">— اختر —</option>
                {(employees.data ?? []).map((u: any) => {
                  const uid = u.id ?? u.user_id;
                  return <option key={uid} value={uid}>{u.full_name || u.email}</option>;
                })}
              </select>
            </div>
          )}
          <div>
            <Label className="text-xs">اسم مختصر (اختياري)</Label>
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="مثلاً: لابتوب المكتب" />
          </div>
        </div>
        <div>
          <Label className="text-xs">معرّف الجهاز (ID)</Label>
          <Input value={newFp} onChange={(e) => setNewFp(e.target.value)} placeholder="الصق المعرّف الذي أرسله الموظف" className="font-mono text-xs" />
        </div>
        <Button onClick={addDevice} disabled={saving} className="gradient-primary text-white">
          {saving ? <Loader2 className="size-4 animate-spin ml-1" /> : null}تفعيل الجهاز
        </Button>
      </div>

      {!scoped && (
        <div className="card-surface rounded-2xl p-4 space-y-2">
          <Label className="text-xs">عرض أجهزة موظف محدد</Label>
          <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="w-full h-10 rounded-xl border border-border/60 bg-background px-3 text-sm">
            <option value="">— كل الموظفين —</option>
            {Array.from(grouped.entries()).map(([uid, list]) => (
              <option key={uid} value={uid}>{list[0].full_name || list[0].email} ({list.length})</option>
            ))}
          </select>
        </div>
      )}


      {devices.isLoading ? <Loader2 className="animate-spin mx-auto" /> :
        !entries.length ? <div className="card-surface p-8 text-center text-muted-foreground rounded-2xl">لا توجد أجهزة مسجّلة بعد</div> :
        <div className="space-y-3">
          {entries.map(([uid, list]) => (

            <div key={uid} className="card-surface rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div>
                  <div className="font-bold">{list[0].full_name || list[0].email}</div>
                  <div className="text-xs text-muted-foreground">{list[0].email} • {list.length} جهاز</div>
                </div>
                <Button size="sm" variant="outline" onClick={async () => {
                  if (!confirm("مسح كل أجهزة هذا الموظف؟")) return;
                  await resetFn({ data: { user_id: uid } });
                  qc.invalidateQueries({ queryKey: ["admin-devices"] });
                }}><Repeat className="size-4 ml-1" />فك الربط بالكامل</Button>
              </div>
              <div className="space-y-2">
                {list.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded-xl border border-border/40">
                    <div className="min-w-0 text-xs">
                      <div className="font-mono truncate">{d.device_label || d.device_fingerprint.slice(0, 16) + "…"}</div>
                      <div className="text-muted-foreground truncate">{d.user_agent?.slice(0, 80)}</div>
                      <div className="text-muted-foreground">آخر ظهور: {formatLocaleDateTime(d.last_seen_at, "ar")}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={async () => {
                      if (!confirm("حذف هذا الجهاز؟")) return;
                      await delFn({ data: { device_id: d.id } });
                      qc.invalidateQueries({ queryKey: ["admin-devices"] });
                    }}><Trash2 className="size-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}

export { DevicesTab };
