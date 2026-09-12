import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Edit, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteProduct,
  getProductImageUrl,
  prepareProductImageUpload,
  saveProduct,
} from "@/lib/categories.functions";
import { ensureSlug } from "@/lib/slug";

type ProductDraft = {
  id?: string;
  name: string;
  slug: string;
  description?: string | null;
  short_description?: string | null;
  category_id?: string | null;
  main_image?: string | null;
  gallery?: string[];
  warranty_days?: number;
  warranty_text?: string | null;
  refund_text?: string | null;
  base_price_egp?: number;
  discount_percent?: number;
  discount_ends_at?: string | null;
  featured?: boolean;
  active?: boolean;
  sort_order?: number;
  upsell_ids?: string[];
  category?: { name?: string | null; icon?: string | null } | null;
};

export function ProductsTab() {
  const queryClient = useQueryClient();
  const prepareUpload = useServerFn(prepareProductImageUpload);
  const getImageUrl = useServerFn(getProductImageUrl);
  const saveProductOnServer = useServerFn(saveProduct);
  const deleteProductOnServer = useServerFn(deleteProduct);
  const productsQuery = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () =>
      (await supabase.from("products").select("*, category:categories(name,icon)").order("sort_order")).data ?? [],
  });
  const categoriesQuery = useQuery({
    queryKey: ["admin-cats"],
    queryFn: async () => (await supabase.from("categories").select("*").order("sort_order")).data ?? [],
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductDraft | null>(null);

  function newProduct() {
    setEditing({
      name: "",
      slug: "",
      description: "",
      short_description: "",
      base_price_egp: 0,
      discount_percent: 0,
      warranty_days: 30,
      warranty_text: "",
      refund_text: "",
      category_id: categoriesQuery.data?.[0]?.id,
      active: true,
      featured: false,
      sort_order: 0,
    });
    setOpen(true);
  }

  async function removeProduct(id: string) {
    if (!confirm("حذف المنتج؟")) return;
    try {
      await deleteProductOnServer({ data: { id } });
      toast.success("تم الحذف");
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل حذف المنتج");
    }
  }

  async function save() {
    if (!editing?.name) {
      toast.error("الاسم مطلوب");
      return;
    }

    try {
      await saveProductOnServer({
        data: {
          id: editing.id ?? null,
          name: editing.name.trim(),
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
          featured: Boolean(editing.featured),
          active: Boolean(editing.active),
          sort_order: Number(editing.sort_order) || 0,
          upsell_ids: Array.isArray(editing.upsell_ids) ? editing.upsell_ids : [],
        },
      });
      toast.success("تم الحفظ");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل حفظ المنتج");
    }
  }

  async function uploadImage(file: File) {
    try {
      const contentType = file.type || "image/png";
      const { path, token } = await prepareUpload({ data: { contentType, size: file.size } });
      const { error } = await supabase.storage
        .from("product-images")
        .uploadToSignedUrl(path, token, file, { contentType });
      if (error) throw new Error(`[product-images.upload] ${error.message}`);
      const { url } = await getImageUrl({ data: { path } });
      setEditing((previous) => (previous ? { ...previous, main_image: url } : previous));
      toast.success("تم رفع الصورة");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل رفع الصورة");
    }
  }

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-xl font-bold">المنتجات ({productsQuery.data?.length ?? 0})</h2>
        <Button onClick={newProduct} className="gradient-primary text-white gap-1"><Plus className="size-4" />منتج جديد</Button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(productsQuery.data ?? []).map((product: ProductDraft & { id: string }) => (
          <div key={product.id} className="card-surface rounded-2xl p-4">
            <div className="aspect-video bg-primary/10 rounded-lg overflow-hidden mb-3">
              {product.main_image ? <img src={product.main_image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-4xl opacity-40">{product.category?.icon ?? "🎁"}</div>}
            </div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-sm">{product.name}</div>
                <div className="text-xs text-muted-foreground">{product.base_price_egp} ج.م {Number(product.discount_percent) > 0 && `- ${product.discount_percent}%`}</div>
                {!product.active && <Badge variant="destructive" className="mt-1 text-[10px]">مخفي</Badge>}
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => { setEditing({ ...product }); setOpen(true); }}><Edit className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => void removeProduct(product.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "تعديل" : "منتج جديد"}</DialogTitle></DialogHeader>
          {editing && <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>الاسم</Label><Input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value, slug: editing.slug || ensureSlug(event.target.value) })} /></div>
              <div><Label>الرابط (slug)</Label><Input value={editing.slug} onChange={(event) => setEditing({ ...editing, slug: event.target.value })} /></div>
            </div>
            <div><Label>وصف قصير</Label><Input value={editing.short_description ?? ""} onChange={(event) => setEditing({ ...editing, short_description: event.target.value })} /></div>
            <div><Label>الوصف الكامل</Label><Textarea rows={4} value={editing.description ?? ""} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>السعر (ج.م)</Label><Input type="number" value={editing.base_price_egp} onChange={(event) => setEditing({ ...editing, base_price_egp: Number(event.target.value) })} /></div>
              <div><Label>السعر بعد الخصم (ج.م)</Label><Input type="number" value={Math.round(Number(editing.base_price_egp ?? 0) * (1 - Number(editing.discount_percent ?? 0) / 100) * 100) / 100} onChange={(event) => { const base = Number(editing.base_price_egp ?? 0); const after = Number(event.target.value); setEditing({ ...editing, discount_percent: base > 0 ? Math.max(0, Math.min(100, Math.round((1 - after / base) * 10000) / 100)) : 0 }); }} /></div>
              <div><Label>الضمان</Label><Input value={editing.warranty_text ?? ""} placeholder="مثال: ضمان 30 يوم استبدال" onChange={(event) => setEditing({ ...editing, warranty_text: event.target.value })} /></div>
            </div>
            <div><Label>الاسترداد</Label><Input value={editing.refund_text ?? ""} placeholder="مثال: استرداد خلال 7 أيام" onChange={(event) => setEditing({ ...editing, refund_text: event.target.value })} /></div>
            <div><Label>نهاية الخصم</Label><Input type="datetime-local" value={editing.discount_ends_at?.slice(0, 16) ?? ""} onChange={(event) => setEditing({ ...editing, discount_ends_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></div>
            <div><Label>القسم</Label><select value={editing.category_id ?? ""} onChange={(event) => setEditing({ ...editing, category_id: event.target.value })} className="w-full h-10 rounded-md border border-input bg-input px-3 text-sm"><option value="">— بدون —</option>{(categoriesQuery.data ?? []).map((category: any) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select></div>
            <div className="rounded-xl border border-border p-3">
              <Label>صورة المنتج</Label>
              <div className="mt-2 flex items-center gap-3">
                {editing.main_image ? <img src={editing.main_image} alt="" className="w-24 h-24 object-cover rounded-lg border border-border" /> : <div className="w-24 h-24 rounded-lg border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">لا توجد صورة</div>}
                <label className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm hover:bg-primary/10">رفع صورة<input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); }} /></label>
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2"><Switch checked={Boolean(editing.active)} onCheckedChange={(value) => setEditing({ ...editing, active: value })} /> نشط</label>
              <label className="flex items-center gap-2"><Switch checked={Boolean(editing.featured)} onCheckedChange={(value) => setEditing({ ...editing, featured: value })} /> مميز</label>
            </div>
          </div>}
          <DialogFooter><Button onClick={() => void save()} className="gradient-primary text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}