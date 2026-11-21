import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentIconUrl, preparePaymentIconUpload } from "@/lib/payments.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, CreditCard, Edit, Trash2, Upload, Coins } from "lucide-react";

export function PaymentsTab() {
  const qc = useQueryClient();
  const prepareIconUpload = useServerFn(preparePaymentIconUpload);
  const getIconUrl = useServerFn(getPaymentIconUrl);
  const q = useQuery({ queryKey: ["admin-pm"], queryFn: async () => (await supabase.from("payment_methods").select("*").order("sort_order")).data ?? [] });
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const displayTypeNames: Record<string, string> = {
    local_transfer: "تحويل محلي",
    wallet: "محفظة إلكترونية",
    bank_transfer: "تحويل بنكي",
    crypto: "عملات رقمية",
  };

  async function uploadIcon(file: File, field: "icon" | "network_icon" = "icon") {
    setUploadingIcon(true);
    try {
      const prepared = await prepareIconUpload({ data: { fileName: file.name, contentType: file.type || "image/png", size: file.size } });
      const { error } = await supabase.storage.from("product-images").uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type || "image/png" });
      if (error) throw error;
      const { url } = await getIconUrl({ data: { path: prepared.path } });
      setEditing((current: any) => ({ ...current, [field]: url }));
      toast.success(field === "network_icon" ? "تم رفع صورة الشبكة" : "تم رفع الأيقونة");
    } catch (error: any) {
      toast.error(error?.message ?? "فشل رفع الأيقونة");
    } finally {
      setUploadingIcon(false);
    }
  }

  async function save() {
    const values = {
      name: String(editing.name ?? "").trim(),
      type: String(editing.type ?? "").trim(),
      display_type: String(editing.display_type ?? "local_transfer"),
      country_code: String(editing.country_code ?? "").trim().toUpperCase() || null,
      account_number: String(editing.account_number ?? "").trim() || null,
      account_name: String(editing.account_name ?? "").trim() || null,
      account_label: String(editing.account_label ?? "").trim() || "رقم الحساب",
      account_name_label: String(editing.account_name_label ?? "").trim() || "اسم صاحب الحساب",
      instructions: String(editing.instructions ?? "").trim() || null,
      show_account_name: editing.show_account_name !== false,
      show_instructions: editing.show_instructions !== false,
      show_amount: editing.show_amount !== false,
      icon: String(editing.icon ?? "").trim() || null,
      network_icon: editing.display_type === "crypto" ? String(editing.network_icon ?? "").trim() || null : null,
      sort_order: Number(editing.sort_order) || 0,
      active: Boolean(editing.active),
    };
    if (!values.name || !values.type) {
      toast.error("الاسم والنوع مطلوبان");
      return;
    }
    const op = editing.id
      ? supabase.from("payment_methods").update(values as any).eq("id", editing.id)
      : supabase.from("payment_methods").insert(values as any);
    const { error } = await op;
    if (error) {
      const missingPaymentControls = /account_label|account_name_label|display_type|show_account_name|show_instructions|show_amount|network_icon/i.test(error.message);
      toast.error(missingPaymentControls ? "تحديث حقول طرق الدفع لم يُطبّق على قاعدة البيانات بعد" : error.message);
    } else { toast.success("محفوظ"); setOpen(false); qc.invalidateQueries({ queryKey: ["admin-pm"] }); }
  }
  async function del(id: string) { if (!confirm("حذف؟")) return; await supabase.from("payment_methods").delete().eq("id", id); qc.invalidateQueries({ queryKey: ["admin-pm"] }); }

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-xl font-bold">طرق الدفع</h2>
        <Button onClick={() => { setEditing({ name: "", type: "", display_type: "local_transfer", country_code: null, account_number: "", account_name: "", account_label: "رقم الحساب", account_name_label: "اسم صاحب الحساب", instructions: "", show_account_name: true, show_instructions: true, show_amount: true, icon: "", network_icon: "", active: true, sort_order: 0 }); setOpen(true); }} className="gradient-primary text-white gap-1"><Plus className="size-4" />جديد</Button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {(q.data ?? []).map((p: any) => (
          <div key={p.id} className="card-surface rounded-2xl p-4">
            <div className="flex items-start justify-between">
              <div className="flex min-w-0 gap-3">
                <div className="size-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted flex items-center justify-center">
                  {p.icon && /^(https?:\/\/|\/)/i.test(p.icon)
                    ? <img src={p.icon} alt={`أيقونة ${p.name}`} className="size-7 object-contain" />
                    : p.icon
                      ? <span className="text-xl">{p.icon}</span>
                      : <CreditCard className="size-5 text-muted-foreground" />}
                </div>
                <div className="min-w-0">
                <div className="font-bold">{p.name}</div>
                <div className="text-xs text-muted-foreground">{displayTypeNames[p.display_type] ?? "تحويل محلي"} · {p.type} {p.country_code && `· ${p.country_code}`}</div>
                {p.account_number && <div className="font-mono text-sm mt-1">{p.account_label || "رقم الحساب"}: {p.account_number}</div>}
                {p.show_account_name !== false && p.account_name && <div className="text-xs text-muted-foreground">{p.account_name_label || "اسم صاحب الحساب"}: {p.account_name}</div>}
                {p.show_instructions !== false && p.instructions && <div className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap break-words">{p.instructions}</div>}
                <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                  <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "نشط" : "متوقف"}</Badge>
                  <span>الترتيب: {p.sort_order}</span>
                </div>
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}><Edit className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => del(p.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="payment-method-dialog" dir="rtl">
          <DialogHeader className="payment-method-dialog-header"><DialogTitle>طريقة دفع</DialogTitle></DialogHeader>
          {editing && (
            <div className="payment-method-form">
              <div><Label>الاسم</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>النوع</Label><Input value={editing.type ?? ""} onChange={(e) => setEditing({ ...editing, type: e.target.value })} placeholder="vodafone_cash / instapay / binance ..." /></div>
              <div>
                <Label>شكل عرض طريقة الدفع</Label>
                <Select value={editing.display_type ?? "local_transfer"} onValueChange={(value) => setEditing({ ...editing, display_type: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local_transfer">تحويل محلي</SelectItem>
                    <SelectItem value="wallet">محفظة إلكترونية</SelectItem>
                    <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                    <SelectItem value="crypto">عملات رقمية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>الدولة (اختياري)</Label><Input value={editing.country_code ?? ""} onChange={(e) => setEditing({ ...editing, country_code: e.target.value || null })} placeholder="EG / SA / null" /></div>
              <div className="payment-method-pair">
                <div><Label>عنوان الرقم أو العنوان</Label><Input value={editing.account_label ?? ""} onChange={(e) => setEditing({ ...editing, account_label: e.target.value })} placeholder="رقم المحفظة / عنوان الشبكة" /></div>
                <div><Label>الرقم أو العنوان (اختياري)</Label><Input value={editing.account_number ?? ""} onChange={(e) => setEditing({ ...editing, account_number: e.target.value })} /></div>
              </div>
              <div className="payment-method-pair">
                <div><Label>عنوان الاسم</Label><Input value={editing.account_name_label ?? ""} onChange={(e) => setEditing({ ...editing, account_name_label: e.target.value })} placeholder="اسم البنك / اسم الشبكة" /></div>
                <div><Label>قيمة الاسم</Label><Input value={editing.account_name ?? ""} onChange={(e) => setEditing({ ...editing, account_name: e.target.value })} /></div>
              </div>
              <div><Label>تعليمات</Label><Textarea value={editing.instructions ?? ""} onChange={(e) => setEditing({ ...editing, instructions: e.target.value })} /></div>
              <div className="payment-method-switches">
                <label><span>إظهار الاسم</span><Switch checked={editing.show_account_name ?? true} onCheckedChange={(v) => setEditing({ ...editing, show_account_name: v })} /></label>
                <label><span>إظهار التعليمات</span><Switch checked={editing.show_instructions ?? true} onCheckedChange={(v) => setEditing({ ...editing, show_instructions: v })} /></label>
                <label><span>إظهار المبلغ المطلوب</span><Switch checked={editing.show_amount ?? true} onCheckedChange={(v) => setEditing({ ...editing, show_amount: v })} /></label>
              </div>
              <div>
                <Label>صورة الأيقونة</Label>
                <div className="flex items-center gap-2">
                  <label className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent">
                    <Upload className="size-4" />
                    {uploadingIcon ? "جاري رفع الصورة..." : editing.icon ? "تغيير صورة الأيقونة" : "اختيار صورة الأيقونة"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      disabled={uploadingIcon}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadIcon(file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <div className="size-10 shrink-0 overflow-hidden rounded-lg border border-border bg-muted flex items-center justify-center">
                    {editing.icon && /^(https?:\/\/|\/)/i.test(editing.icon)
                      ? <img src={editing.icon} alt="معاينة الأيقونة" className="size-7 object-contain" />
                      : editing.icon
                        ? <span className="text-xl">{editing.icon}</span>
                        : <CreditCard className="size-5 text-muted-foreground" />}
                  </div>
                </div>
                {editing.icon && <Button type="button" size="sm" variant="ghost" className="mt-1 text-destructive" onClick={() => setEditing({ ...editing, icon: null })}>حذف الصورة</Button>}
              </div>
              {editing.display_type === "crypto" && (
                <div>
                  <Label>صورة الشبكة</Label>
                  <div className="flex items-center gap-2">
                    <label className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent">
                      <Upload className="size-4" />
                      {uploadingIcon ? "جاري رفع الصورة..." : editing.network_icon ? "تغيير صورة الشبكة" : "اختيار صورة الشبكة"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        disabled={uploadingIcon}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadIcon(file, "network_icon");
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <div className="size-10 shrink-0 overflow-hidden rounded-full border border-border bg-muted flex items-center justify-center">
                      {editing.network_icon
                        ? <img src={editing.network_icon} alt="معاينة صورة الشبكة" className="size-8 object-contain" />
                        : <Coins className="size-5 text-muted-foreground" />}
                    </div>
                  </div>
                  {editing.network_icon && <Button type="button" size="sm" variant="ghost" className="mt-1 text-destructive" onClick={() => setEditing({ ...editing, network_icon: null })}>حذف صورة الشبكة</Button>}
                </div>
              )}
              <div><Label>الترتيب</Label><Input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} /></div>
              <label className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> نشط</label>
            </div>
          )}
          <DialogFooter><Button onClick={save} className="gradient-primary text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
