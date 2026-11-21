import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUiState } from "@/lib/ui-state";
import { formatLocaleDateTime } from "@/lib/format";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Check, Plus, Star, Trash2 } from "lucide-react";

export function ReviewsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useUiState<"pending" | "approved" | "all">("orders", "filter", "pending");
  const q = useQuery({
    queryKey: ["admin-reviews", filter],
    queryFn: async () => {
      let qb = supabase.from("reviews").select("*, product:products(name, slug)").order("created_at", { ascending: false });
      if (filter === "pending") qb = qb.eq("approved", false);
      if (filter === "approved") qb = qb.eq("approved", true);
      return (await qb).data ?? [];
    },
  });
  async function approve(id: string, val: boolean) {
    await supabase.from("reviews").update({ approved: val }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    toast.success(val ? "تم النشر" : "تم الإخفاء");
  }
  async function del(id: string) {
    if (!confirm("حذف المراجعة؟")) return;
    await supabase.from("reviews").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-reviews"] });
  }
  const [addOpen, setAddOpen] = useState(false);
  const [newR, setNewR] = useState<any>({ product_id: "", customer_name: "", rating: 5, comment: "", approved: true });
  const productsQ = useQuery({ queryKey: ["reviews-products"], queryFn: async () => (await supabase.from("products").select("id,name")).data ?? [] });
  async function saveNew() {
    if (!newR.product_id || !newR.customer_name) return toast.error("أكمل البيانات");
    const { error } = await supabase.from("reviews").insert(newR);
    if (error) toast.error(error.message);
    else { toast.success("تم"); setAddOpen(false); setNewR({ product_id: "", customer_name: "", rating: 5, comment: "", approved: true }); qc.invalidateQueries({ queryKey: ["admin-reviews"] }); }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["pending","approved","all"] as const).map((k) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-lg text-xs ${filter === k ? "gradient-primary text-white" : "card-surface"}`}>
              {k === "pending" ? "بانتظار الموافقة" : k === "approved" ? "منشور" : "الكل"}
            </button>
          ))}
        </div>
        <Button onClick={() => setAddOpen(true)} className="gradient-primary text-white gap-1"><Plus className="size-4" />إضافة مراجعة</Button>
      </div>
      <div className="space-y-3">
        {(q.data ?? []).map((r: any) => (
          <div key={r.id} className="card-surface rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold">{r.customer_name}</span>
                  <div className="flex">{[1,2,3,4,5].map((n) => <Star key={n} className={`size-3.5 ${n <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-muted"}`} />)}</div>
                  {r.approved ? <Badge>منشور</Badge> : <Badge variant="secondary">بانتظار</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">على: {r.product?.name}</div>
                {r.comment && <p className="text-sm mt-2">{r.comment}</p>}
                <div className="text-[10px] text-muted-foreground mt-1">{formatLocaleDateTime(r.created_at, "ar-EG")}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant={r.approved ? "outline" : "default"} onClick={() => approve(r.id, !r.approved)} className={!r.approved ? "gradient-primary text-white" : ""}>
                  {r.approved ? "إخفاء" : <><Check className="size-4 ml-1" />نشر</>}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => del(r.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </div>
          </div>
        ))}
        {(q.data ?? []).length === 0 && <div className="card-surface rounded-2xl p-12 text-center text-muted-foreground">لا توجد مراجعات</div>}
      </div>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>إضافة مراجعة يدوية</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>المنتج</Label>
              <select value={newR.product_id} onChange={(e) => setNewR({ ...newR, product_id: e.target.value })} className="w-full h-10 rounded-md border border-input bg-input px-3 text-sm">
                <option value="">— اختر —</option>
                {(productsQ.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><Label>اسم العميل</Label><Input value={newR.customer_name} onChange={(e) => setNewR({ ...newR, customer_name: e.target.value })} /></div>
            <div><Label>التقييم (1-5)</Label><Input type="number" min={1} max={5} value={newR.rating} onChange={(e) => setNewR({ ...newR, rating: Number(e.target.value) })} /></div>
            <div><Label>التعليق</Label><Textarea rows={3} value={newR.comment} onChange={(e) => setNewR({ ...newR, comment: e.target.value })} /></div>
            <label className="flex items-center gap-2"><Switch checked={newR.approved} onCheckedChange={(v) => setNewR({ ...newR, approved: v })} /> نشر مباشرة</label>
          </div>
          <DialogFooter><Button onClick={saveNew} className="gradient-primary text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
