import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function CurrenciesTab() {
  const qc = useQueryClient();
  const currsQ = useQuery({ queryKey: ["admin-currencies"], queryFn: async () => (await supabase.from("currencies").select("*").order("code")).data ?? [] });
  const ratesQ = useQuery({ queryKey: ["admin-rates"], queryFn: async () => (await supabase.from("exchange_rates").select("*, currency:currencies(name,symbol)")).data ?? [] });
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => { if (ratesQ.data) { const v: any = {}; ratesQ.data.forEach((r: any) => v[r.currency_code] = String(r.rate_from_egp)); setValues(v); } }, [ratesQ.data]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  async function saveAll() {
    for (const [code, val] of Object.entries(values)) {
      await supabase.from("exchange_rates").update({ rate_from_egp: Number(val), updated_at: new Date().toISOString() }).eq("currency_code", code);
    }
    toast.success("تم تحديث الأسعار");
    qc.invalidateQueries({ queryKey: ["admin-rates"] });
  }

  async function saveCurrency() {
    if (!editing.code || !editing.name || !editing.symbol) return toast.error("أكمل البيانات");
    const code = editing.code.toUpperCase();
    const isNew = !editing._original_code;
    if (isNew) {
      const { error } = await supabase.from("currencies").insert({ code, name: editing.name, symbol: editing.symbol, active: editing.active ?? true });
      if (error) return toast.error(error.message);
      await supabase.from("exchange_rates").insert({ currency_code: code, rate_from_egp: Number(editing.rate_from_egp) || 1 });
    } else {
      const { error } = await supabase.from("currencies").update({ name: editing.name, symbol: editing.symbol, active: editing.active }).eq("code", editing._original_code);
      if (error) return toast.error(error.message);
      if (editing.rate_from_egp != null) {
        await supabase.from("exchange_rates").update({ rate_from_egp: Number(editing.rate_from_egp), updated_at: new Date().toISOString() }).eq("currency_code", editing._original_code);
      }
    }
    toast.success("تم الحفظ");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-currencies"] });
    qc.invalidateQueries({ queryKey: ["admin-rates"] });
  }
  async function delCurrency(code: string) {
    if (!confirm(`حذف العملة ${code}؟`)) return;
    await supabase.from("exchange_rates").delete().eq("currency_code", code);
    const { error } = await supabase.from("currencies").delete().eq("code", code);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["admin-currencies"] });
    qc.invalidateQueries({ queryKey: ["admin-rates"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold">العملات</h2>
            <p className="text-xs text-muted-foreground">إضافة / تعديل / حذف العملات المدعومة</p>
          </div>
          <Button onClick={() => { setEditing({ code: "", name: "", symbol: "", rate_from_egp: 1, active: true }); setOpen(true); }} className="gradient-primary text-white gap-1"><Plus className="size-4" />عملة جديدة</Button>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {(currsQ.data ?? []).map((c: any) => (
            <div key={c.code} className="card-surface rounded-2xl p-4 flex items-center justify-between">
              <div>
                <div className="font-bold">{c.name} <span className="text-xs text-muted-foreground">({c.code})</span></div>
                <div className="text-xs text-muted-foreground">الرمز: {c.symbol} {!c.active && "· متوقف"}</div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => {
                  const r = ratesQ.data?.find((x: any) => x.currency_code === c.code);
                  setEditing({ ...c, _original_code: c.code, rate_from_egp: r?.rate_from_egp ?? 1 });
                  setOpen(true);
                }}><Edit className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => delCurrency(c.code)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold mb-2">أسعار الصرف (من الجنيه المصري)</h2>
        <p className="text-xs text-muted-foreground mb-4">مثال: 1 ج.م = 0.021 USD يعني تسعير الدولار = السعر بالجنيه × 0.021</p>
        <div className="grid md:grid-cols-2 gap-3">
          {(ratesQ.data ?? []).map((r: any) => (
            <div key={r.currency_code} className="card-surface rounded-2xl p-4">
              <Label>{r.currency?.name} ({r.currency_code}) {r.currency?.symbol}</Label>
              <Input type="number" step="any" value={values[r.currency_code] ?? ""} onChange={(e) => setValues({ ...values, [r.currency_code]: e.target.value })} />
            </div>
          ))}
        </div>
        <Button onClick={saveAll} className="gradient-primary text-white mt-4">حفظ الكل</Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?._original_code ? "تعديل عملة" : "عملة جديدة"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>الكود (مثل USD)</Label><Input value={editing.code ?? ""} disabled={!!editing._original_code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} maxLength={5} /></div>
              <div><Label>الاسم</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>الرمز</Label><Input value={editing.symbol ?? ""} onChange={(e) => setEditing({ ...editing, symbol: e.target.value })} placeholder="$ / ر.س / ج.م" /></div>
              <div><Label>سعر الصرف (1 ج.م = ؟ من هذه العملة)</Label><Input type="number" step="any" value={editing.rate_from_egp ?? ""} onChange={(e) => setEditing({ ...editing, rate_from_egp: e.target.value })} /></div>
              <label className="flex items-center gap-2"><Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> نشط</label>
            </div>
          )}
          <DialogFooter><Button onClick={saveCurrency} className="gradient-primary text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { CurrenciesTab };
