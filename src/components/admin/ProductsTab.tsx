import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Edit } from "lucide-react";
import { ensureSlug } from "@/lib/slug";
import {
  saveProduct,
  deleteProduct,
  prepareProductImageUpload,
  getProductImageUrl,
} from "@/lib/categories.functions";

const emptyProduct = {
  id: null as string | null,
  name: "",
  slug: "",
  short_description: "",
  description: "",
  category_id: null as string | null,
  main_image: null as string | null,
  warranty_days: 0,
  warranty_text: "",
  base_price_egp: 0,
  discount_percent: 0,
  featured: false,
  active: true,
  sort_order: 0,
};

export function ProductsTab() {
  const qc = useQueryClient();
  const productsQ = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () =>
      (await supabase.from("products").select("*, category:categories(name)").order("sort_order")).data ?? [],
  });
  const catsQ = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => (await supabase.from("categories").select("id,name").order("sort_order")).data ?? [],
  });
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  async function save() {
    if (!editing.name) return toast.error("الاسم مطلوب");
    try {
      await saveProduct({
        data: {
          id: editing.id ?? null,
          name: editing.name,
          slug: ensureSlug(editing.slug, editing.name),
          description: editing.description || null,
          short_description: editing.short_description || null,
          category_id: editing.category_id || null,
          main_image: editing.main_image || null,
          gallery: Array.isArray(editing.gallery) ? editing.gallery : [],
          warranty_days: Number(editing.warranty_days) || 0,
          warranty_text: editing.warranty_text || null,
          refund_text: editing.refund_text || null,
          base_price_egp: Number(editing.base_price_egp) || 0,
          discount_percent: Number(editing.discount_percent) || 0,
          discount_ends_at: editing.discount_ends_at || null,
          featured: !!editing.featured,
          active: !!editing.active,
          sort_order: Number(editing.sort_order) || 0,
          upsell_ids: Array.isArray(editing.upsell_ids) ? editing.upsell_ids : [],
        },
      });
      toast.success("محفوظ");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["latest-products"] });
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    }
  }

  async function del(id: string) {
    if (!confirm("حذف المنتج؟")) return;
    try {
      await deleteProduct({ data: { id } });
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (e: any) {
      toast.error(e?.message || "فشل الحذف");
    }
  }

  async function uploadImage(file: File) {
    try {
      const { path, token } = await prepareProductImageUpload({
        data: { fileName: file.name, contentType: file.type || "image/png", size: file.size },
      });
      const { error } = await supabase.storage
        .from("product-images")
        .uploadToSignedUrl(path, token, file, { contentType: file.type || "image/png" });
      if (error) throw new Error(error.message);
      const { url } = await getProductImageUrl({ data: { path } });
      setEditing((prev: any) => ({ ...(prev ?? {}), main_image: url }));
      toast.success("تم رفع الصورة");
    } catch (e: any) {
      toast.error(e?.message || "فشل رفع الصورة");
    }
  }

  return (
    <div>
      <div className="flex justify-between mb-6">
        <h2 className="text-xl font-bold">المنتجات</h2>
        <Button
          onClick={() => { setEditing({ ...emptyProduct }); setOpen(true); }}
          className="gradient-primary text-white gap-1"
        >
          <Plus className="size-4" />منتج جديد
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
        {(productsQ.data ?? []).map((p: any) => (
          <div key={p.id} className="bg-card border border-border/60 rounded-2xl p-4 flex flex-col gap-3 hover:border-primary/50 transition-all">
            <div className="flex items-center gap-3">
              <div className="size-14 rounded-xl overflow-hidden bg-muted flex items-center justify-center shrink-0">
                {p.main_image ? (
                  <img src={p.main_image} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-black">{p.name?.trim().charAt(0)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground truncate">{p.category?.name ?? "بدون قسم"}</div>
                <div className="text-sm font-bold text-primary">{p.base_price_egp} ج.م</div>
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="rounded-full flex-1" onClick={() => { setEditing(p); setOpen(true); }}>
                <Edit className="size-4" />تعديل
              </Button>
              <Button size="sm" variant="outline" className="rounded-full text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => del(p.id)}>
                <Trash2 className="size-4" />حذف
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>منتج</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>الاسم</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>الرابط (slug)</Label><Input value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} /></div>
              <div>
                <Label>القسم</Label>
                <select
                  value={editing.category_id ?? ""}
                  onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}
                  className="w-full h-10 rounded-md border border-input bg-input px-3 text-sm"
                >
                  <option value="">— بدون قسم —</option>
                  {(catsQ.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>السعر (ج.م)</Label><Input type="number" step="any" value={editing.base_price_egp} onChange={(e) => setEditing({ ...editing, base_price_egp: Number(e.target.value) })} /></div>
                <div><Label>الخصم %</Label><Input type="number" min={0} max={100} value={editing.discount_percent ?? 0} onChange={(e) => setEditing({ ...editing, discount_percent: Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>أيام الضمان</Label><Input type="number" min={0} value={editing.warranty_days ?? 0} onChange={(e) => setEditing({ ...editing, warranty_days: Number(e.target.value) })} /></div>
                <div><Label>نص الضمان (اختياري)</Label><Input value={editing.warranty_text ?? ""} onChange={(e) => setEditing({ ...editing, warranty_text: e.target.value })} /></div>
              </div>
              <div><Label>وصف قصير</Label><Input value={editing.short_description ?? ""} onChange={(e) => setEditing({ ...editing, short_description: e.target.value })} /></div>
              <div><Label>الوصف الكامل</Label><Textarea rows={4} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div>
                <Label>صورة المنتج</Label>
                {editing.main_image && (
                  <div className="flex items-center gap-2 my-2">
                    <img src={editing.main_image} alt="" className="size-20 rounded-lg object-cover" />
                    <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, main_image: null })}>حذف الصورة</Button>
                  </div>
                )}
                <input
                  id="product-image-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 gap-2 w-full"
                  onClick={() => document.getElementById("product-image-input")?.click()}
                >
                  <Plus className="size-4" />
                  {editing.main_image ? "تغيير الصورة" : "تحميل صورة"}
                </Button>
              </div>
              <div><Label>الترتيب</Label><Input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} /></div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2"><Switch checked={!!editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> نشط</label>
                <label className="flex items-center gap-2"><Switch checked={!!editing.featured} onCheckedChange={(v) => setEditing({ ...editing, featured: v })} /> مميز</label>
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={save} className="gradient-primary text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
