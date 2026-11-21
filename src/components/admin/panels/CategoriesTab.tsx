import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { prepareCategoryImageUpload, getCategoryImageUrl, saveCategory, deleteCategory } from "@/lib/categories.functions";
import { ensureSlug } from "@/lib/slug";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Edit, Plus, Trash2 } from "lucide-react";

export function CategoriesTab() {
  const qc = useQueryClient();
  const catsQ = useQuery({ queryKey: ["admin-categories"], queryFn: async () => (await supabase.from("categories").select("*").order("sort_order")).data ?? [] });
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  async function save() {
    if (!editing.name) return toast.error("الاسم مطلوب");
    try {
      await saveCategory({
        data: {
          id: editing.id ?? null,
          name: editing.name,
          slug: ensureSlug(editing.slug, editing.name),
          icon: editing.icon ?? null,
          banner_image: editing.banner_image ?? null,
          sort_order: Number(editing.sort_order) || 0,
          active: !!editing.active,
        },
      });
      toast.success("محفوظ");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    }
  }
  async function del(id: string) {
    if (!confirm("حذف؟")) return;
    try { await deleteCategory({ data: { id } }); qc.invalidateQueries({ queryKey: ["admin-categories"] }); }
    catch (e: any) { toast.error(e?.message || "فشل الحذف"); }
  }
  async function uploadCategoryBanner(file: File) {
    try {
      const { path, token } = await prepareCategoryImageUpload({
        data: {
          fileName: file.name,
          contentType: file.type || "image/png",
          size: file.size,
        },
      });
      const { error } = await supabase.storage
        .from("product-images")
        .uploadToSignedUrl(path, token, file, { contentType: file.type || "image/png" });
      if (error) throw new Error(error.message);
      const { url } = await getCategoryImageUrl({ data: { path } });
      setEditing((prev: any) => ({ ...(prev ?? {}), banner_image: url }));
      toast.success("تم رفع صورة القسم");
    } catch (e: any) {
      toast.error(e?.message || "فشل رفع الصورة");
    }
  }

  return (
    <div>
      <div className="flex justify-between mb-6">
        <h2 className="text-xl font-bold">الأقسام</h2>
        <Button onClick={() => { setEditing({ name: "", slug: "", icon: "🎁", banner_image: null, sort_order: 0, active: true }); setOpen(true); }} className="gradient-primary text-white gap-1"><Plus className="size-4" />قسم جديد</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
        {(catsQ.data ?? []).map((c: any) => {
          const label = c.name || "قسم";
          const initial = label.trim().charAt(0);
          return (
            <div key={c.id} className="bg-card border border-border/60 rounded-2xl p-4 flex flex-col items-center text-center gap-3 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all">
              <div className="relative">
                <div className="size-20 rounded-full gradient-primary ring-4 ring-background flex items-center justify-center text-2xl font-black text-white shadow-xl">
                  {initial}
                </div>
                <div className="absolute bottom-0 right-0 size-6 rounded-full bg-primary flex items-center justify-center ring-2 ring-background">
                  <span className="text-[10px] text-white">{c.icon}</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground">/{c.slug}</div>
              </div>
              <div className="flex gap-1.5 w-full justify-center">
                <Button size="sm" variant="outline" className="rounded-full flex-1" onClick={() => { setEditing(c); setOpen(true); }}><Edit className="size-4" />تعديل</Button>
                <Button size="sm" variant="outline" className="rounded-full text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => del(c.id)}><Trash2 className="size-4" />حذف</Button>
              </div>
            </div>
          );
        })}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>قسم</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>الاسم</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>الرابط</Label><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} /></div>
              <div>
                <Label>صورة القسم</Label>
                {editing.banner_image && (
                  <div className="flex items-center gap-2 my-2">
                    <img src={editing.banner_image} alt="" className="size-20 rounded-lg object-cover" />
                    <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, banner_image: null })}>حذف الصورة</Button>
                  </div>
                )}
                <input
                  id="cat-banner-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadCategoryBanner(e.target.files[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 gap-2 w-full"
                  onClick={() => document.getElementById("cat-banner-input")?.click()}
                >
                  <Plus className="size-4" />
                  {editing.banner_image ? "تغيير الصورة" : "تحميل صورة"}
                </Button>
              </div>

              <div><Label>الترتيب</Label><Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} /></div>
              <label className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> نشط</label>
            </div>
          )}
          <DialogFooter><Button onClick={save} className="gradient-primary text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
