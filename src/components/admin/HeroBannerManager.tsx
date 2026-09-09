import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Edit, Globe, GripVertical, Menu, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HeroBannerView } from "@/components/site/HeroCarousel";
import {
  HERO_ICON_KEYS,
  blankBanner,
  newId,
  normalizeBanner,
  type HeroBanner,
  type HeroDevice,
  type HeroBadgeItem,
  type HeroButton,
} from "@/lib/hero-banners";
import {
  listHeroBanners,
  saveHeroBanner,
  deleteHeroBanner,
  toggleHeroBanner,
  reorderHeroBanners,
  duplicateHeroBanner,
  importHeroBanners,
} from "@/lib/hero-banners.functions";

const BUCKET = "product-images";
const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

/** إطار معاينة بعرض الموقع الحقيقي (1280px) مُصغّر بالتحويل — يعرض التصميم بنفس نسب الصفحة الرئيسية. */
const SITE_WIDTH = 1280;
const SITE_HEIGHT = 340;
function ScaledPreview({ children, width, height }: { children: React.ReactNode; width?: number; height?: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const w = width ?? SITE_WIDTH;
  const h = height ?? SITE_HEIGHT;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / w));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);

  return (
    <div ref={boxRef} className="mt-1 w-full" style={{ height: h * scale }}>
      <div
        className="overflow-hidden rounded-2xl border border-border bg-hero text-hero-foreground"
        style={{
          width: w,
          height: h,
          transform: `scale(${scale})`,
          transformOrigin: "top right",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function MobilePagePreview({ children }: { children: React.ReactNode }) {
  return (
    <ScaledPreview width={390} height={760}>
      <div className="relative flex h-full flex-col overflow-hidden rounded-[32px] border-8 border-secondary bg-background">
        <span className="absolute left-1/2 top-0 z-20 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-secondary" aria-hidden="true" />
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg border border-border bg-muted" />
            <div className="text-right leading-tight">
              <p className="text-sm font-bold">MG Pro</p>
              <p className="text-xs text-muted-foreground">الاشتراكات الرقمية</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <Search className="size-4" />
            <Globe className="size-4" />
            <ShoppingCart className="size-4" />
            <Menu className="size-4" />
          </div>
        </div>
        <div className="h-[230px] shrink-0">{children}</div>
        <div className="flex-1 space-y-5 bg-background px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-6 w-1 rounded-full bg-primary" />
              <span className="text-base font-bold">تصفح الأقسام</span>
            </div>
            <span className="rounded-lg bg-card px-3 py-2 text-xs text-muted-foreground">عرض الكل</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[0, 1].map((item) => (
              <div key={item} className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="h-28 bg-muted" />
                <div className="border-t border-border p-3 text-sm font-bold">قسم المتجر</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border bg-card p-4 text-right">
            <p className="text-sm font-bold">متجر الاشتراكات الرقمية</p>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">اشتراكات رقمية وخدمة موثوقة في مكان واحد.</p>
          </div>
        </div>
      </div>
    </ScaledPreview>
  );
}


async function uploadMedia(file: File, kind: "image" | "video" | "poster") {
  const path = `hero/${kind}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  const { data, error: sErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, TEN_YEARS);
  if (sErr || !data?.signedUrl) throw sErr ?? new Error("فشل إنشاء الرابط");
  return { url: data.signedUrl, path };
}

async function removeMedia(path?: string | null) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const POS = [
  { value: "start", label: "البداية" },
  { value: "center", label: "الوسط" },
  { value: "end", label: "النهاية" },
];

function NumField({ label, value, onChange, min = 0, max = 120 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function HeroBannerManager({ device = "desktop" }: { device?: HeroDevice } = {}) {
  const isMobilePanel = device === "mobile";
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-hero-banners", device],
    queryFn: async () => {
      const { data, error } = await supabase.from("hero_banners").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []).map(normalizeBanner).filter((b) => b.device === device);
    },
  });

  const [order, setOrder] = useState<HeroBanner[]>([]);
  useEffect(() => {
    if (q.data) setOrder(q.data);
  }, [q.data]);

  const [editing, setEditing] = useState<HeroBanner | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dragIndex = useRef<number | null>(null);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin-hero-banners"] });
    qc.invalidateQueries({ queryKey: ["admin-hero-banners", device] });
    qc.invalidateQueries({ queryKey: ["hero-banners"] });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    const row = bannerToRow({ ...editing, device });
    const res = isNew
      ? await supabase.from("hero_banners").insert(row as any)
      : await supabase.from("hero_banners").update(row as any).eq("id", editing.id);
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success("تم حفظ البانر");
    setEditing(null);
    refresh();
  }

  async function toggleActive(b: HeroBanner) {
    const { error } = await supabase.from("hero_banners").update({ active: !b.active }).eq("id", b.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function duplicate(b: HeroBanner) {
    const row = bannerToRow({ ...b, device, title: `${b.title} (نسخة)`, sort_order: order.length, active: false });
    const { error } = await supabase.from("hero_banners").insert(row as any);
    if (error) return toast.error(error.message);
    toast.success("تم نسخ البانر");
    refresh();
  }

  async function del(b: HeroBanner) {
    if (!confirm("حذف هذا البانر؟")) return;
    const { error } = await supabase.from("hero_banners").delete().eq("id", b.id);
    if (error) return toast.error(error.message);
    await removeMedia(b.media_path);
    await removeMedia(b.poster_path);
    toast.success("تم الحذف");
    refresh();
  }

  async function persistOrder(list: HeroBanner[]) {
    setOrder(list);
    const results = await Promise.all(
      list.map((b, i) => supabase.from("hero_banners").update({ sort_order: i }).eq("id", b.id)),
    );
    const err = results.find((r) => r.error)?.error;
    if (err) toast.error(err.message);
    else refresh();
  }

  function onDrop(target: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from == null || from === target) return;
    const list = [...order];
    const [moved] = list.splice(from, 1);
    list.splice(target, 0, moved);
    persistOrder(list);
  }

  const [importing, setImporting] = useState(false);

  /** ربط لوحة الموبايل بالبانر الظاهر حاليًا على الموبايل (بنرات الديسكتوب) بنسخها كبنرات موبايل. */
  async function importFromDesktop() {
    setImporting(true);
    const { data, error } = await supabase.from("hero_banners").select("*").order("sort_order");
    if (error) {
      setImporting(false);
      return toast.error(error.message);
    }
    const source = (data ?? []).map(normalizeBanner).filter((b) => b.device === "desktop");
    if (!source.length) {
      setImporting(false);
      return toast.error("لا يوجد بانر حالي لنسخه");
    }
    const rows = source.map((b, i) =>
      bannerToRow({ ...b, device: "mobile", sort_order: order.length + i, active: true }),
    );
    const res = await supabase.from("hero_banners").insert(rows as any);
    setImporting(false);
    if (res.error) return toast.error(res.error.message);
    toast.success("تم ربط بانر الموبايل بالبانر الحالي");
    refresh();
  }

  const preview = useMemo(() => editing, [editing]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-bold">
            {isMobilePanel ? "بانر الصفحة الرئيسية — الموبايل" : "بانر الصفحة الرئيسية"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {isMobilePanel
              ? "بنرات تظهر لزوار الموبايل فقط: المحتوى، الأزرار، الكروت، الوسائط، والترتيب."
              : "إدارة كاملة للبنرات: المحتوى، الأزرار، الكروت، الوسائط، والترتيب."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isMobilePanel && (
            <Button variant="secondary" disabled={importing} onClick={importFromDesktop}>
              {importing ? "جارٍ الربط…" : "ربط البانر الحالي"}
            </Button>
          )}
          <Button
            onClick={() => {
              setEditing(blankBanner(order.length, device));
              setIsNew(true);
            }}
            className="gap-2"
          >
            <Plus className="size-4" /> بانر جديد
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {q.isLoading && <div className="card-surface rounded-2xl p-4 text-sm text-muted-foreground">جارٍ التحميل…</div>}
        {!q.isLoading && !order.length && (
          <div className="card-surface rounded-2xl p-4 text-sm text-muted-foreground">لا توجد بنرات — أضف بانر جديد.</div>
        )}
        {order.map((b, i) => (
          <div
            key={b.id}
            draggable
            onDragStart={() => (dragIndex.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(i)}
            className="card-surface rounded-2xl p-3 flex items-center gap-3"
          >
            <GripVertical className="size-4 text-muted-foreground cursor-grab" aria-hidden />
            <div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
              {b.media_type === "image" && b.media_url ? (
                <img src={b.media_url} alt="" className="h-full w-full object-cover" />
              ) : b.media_type === "video" && (b.poster_url || b.media_url) ? (
                <video src={b.media_url ?? undefined} poster={b.poster_url ?? undefined} muted className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full" style={{ backgroundColor: b.background_color ?? undefined }} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate">{b.title || "بدون عنوان"}</div>
              <div className="text-xs text-muted-foreground truncate">
                {b.media_type === "video" ? "فيديو" : b.media_type === "image" ? "صورة" : "لون"} • {b.buttons.filter((x) => x.enabled).length} زر •{" "}
                {b.badges.filter((x) => x.enabled).length} كارت
              </div>
            </div>
            {b.active ? <Badge>نشط</Badge> : <Badge variant="secondary">متوقف</Badge>}
            <Switch checked={b.active} onCheckedChange={() => toggleActive(b)} aria-label="تفعيل" />
            <Button size="icon" variant="ghost" onClick={() => { setEditing(b); setIsNew(false); }} aria-label="تعديل">
              <Edit className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => duplicate(b)} aria-label="نسخ">
              <Copy className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => del(b)} aria-label="حذف">
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent
          dir="rtl"
          className="hero-editor-dialog grid h-[94vh] w-[calc(100vw-24px)] max-w-[1400px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-lg border-border bg-background p-0 text-foreground shadow-none [&>button]:left-4 [&>button]:right-auto [&>button]:top-4 [&>button]:grid [&>button]:size-9 [&>button]:place-items-center [&>button]:border [&>button]:border-border [&>button]:bg-secondary [&>button]:opacity-100 [&>button]:hover:bg-accent"
        >
          <DialogHeader className="border-b border-border bg-card px-5 py-4 text-right sm:px-6">
            <DialogTitle className="text-xl font-bold leading-9">{isNew ? "بانر جديد" : "تعديل البانر"}</DialogTitle>
            <p className="text-sm text-muted-foreground">اضبط محتوى البانر ومظهره وشاهد النتيجة مباشرة</p>
          </DialogHeader>

          {editing && (
            <div dir="ltr" className="grid min-h-0 gap-5 overflow-y-auto bg-background p-4 lg:grid-cols-[minmax(360px,0.82fr)_minmax(520px,1.18fr)] lg:items-start lg:p-6">
              {/* Live Preview */}
              <aside dir="rtl" className="rounded-lg border border-border bg-card p-4 lg:sticky lg:top-0">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold">معاينة مباشرة</h3>
                    <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">اسحب العنوان أو الوصف أو الأزرار أو الكروت داخل المعاينة لتحديد موضعها.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing({ ...editing, positions: {} })}
                    disabled={!Object.keys(editing.positions ?? {}).length}
                    className="shrink-0 border-border bg-secondary"
                  >
                    إعادة المواضع
                  </Button>
                </div>
                {isMobilePanel ? (
                  <MobilePagePreview>
                    {preview && (
                      <HeroBannerView
                        banner={preview}
                        preview
                        forceDevice="mobile"
                        editable
                        onPositionsChange={(positions) => setEditing((cur) => (cur ? { ...cur, positions } : cur))}
                      />
                    )}
                  </MobilePagePreview>
                ) : (
                  <ScaledPreview>
                    {preview && (
                      <HeroBannerView
                        banner={preview}
                        preview
                        forceDevice="desktop"
                        editable
                        onPositionsChange={(positions) => setEditing((cur) => (cur ? { ...cur, positions } : cur))}
                      />
                    )}
                  </ScaledPreview>
                )}
              </aside>

              <div dir="rtl" className="space-y-4 [&_section]:space-y-4 [&_section]:rounded-lg [&_section]:border [&_section]:border-border [&_section]:bg-card [&_section]:p-4 [&_section>h3]:border-b [&_section>h3]:border-border [&_section>h3]:pb-3 [&_section>h3]:text-base [&_input]:bg-background [&_select]:bg-background [&_textarea]:bg-background">

              {/* المحتوى */}
              <section>
                <h3 className="text-sm font-bold">المعلومات الأساسية</h3>
                <div className="space-y-2 rounded-md border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-4">
                    <Label className="font-semibold">العنوان</Label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch checked={editing.show_title} onCheckedChange={(v) => setEditing({ ...editing, show_title: v })} /> إظهار
                    </label>
                  </div>
                  <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                </div>
                <div className="space-y-2 rounded-md border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-4">
                    <Label className="font-semibold">الوصف</Label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch checked={editing.show_subtitle} onCheckedChange={(v) => setEditing({ ...editing, show_subtitle: v })} /> إظهار
                    </label>
                  </div>
                  <Textarea rows={2} value={editing.subtitle} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} />
                </div>
                <div className="space-y-2 rounded-md border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-4">
                    <Label className="font-semibold">الوصف الثاني</Label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch checked={editing.show_subtitle2} onCheckedChange={(v) => setEditing({ ...editing, show_subtitle2: v })} /> إظهار
                    </label>
                  </div>
                  <Textarea
                    rows={2}
                    value={editing.subtitle2}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        subtitle2: e.target.value,
                        // الكتابة في الحقل تفعّل الإظهار تلقائياً حتى لا يبقى النص مخفياً.
                        show_subtitle2: e.target.value.trim() ? true : editing.show_subtitle2,
                      })
                    }
                  />
                </div>
              </section>

              {/* الوسائط */}
              <section>
                <h3 className="text-sm font-bold">الخلفية / الوسائط</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">النوع</Label>
                    <Select
                      value={editing.media_type}
                      onChange={(v) => setEditing({ ...editing, media_type: v as HeroBanner["media_type"] })}
                      options={[
                        { value: "image", label: "صورة" },
                        { value: "video", label: "فيديو" },
                        { value: "color", label: "لون فقط" },
                        { value: "none", label: "بدون" },
                      ]}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">طريقة العرض</Label>
                    <Select
                      value={editing.media_fit}
                      onChange={(v) => setEditing({ ...editing, media_fit: v as HeroBanner["media_fit"] })}
                      options={[
                        { value: "cover", label: "تغطية كاملة (قص الأطراف)" },
                        { value: "contain", label: "إظهار التصميم بالكامل" },
                      ]}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">لون الخلفية</Label>
                    <Input
                      type="color"
                      value={editing.background_color ?? "#0d1322"}
                      onChange={(e) => setEditing({ ...editing, background_color: e.target.value })}
                    />
                  </div>
                </div>

                {(editing.media_type === "image" || editing.media_type === "video") && (
                  <div className="space-y-2">
                    {editing.media_url && (
                      <div className="flex items-center gap-3">
                        {editing.media_type === "image" ? (
                          <img src={editing.media_url} alt="" className="h-20 w-32 rounded-lg border border-border object-cover" />
                        ) : (
                          <video src={editing.media_url} muted controls className="h-20 w-32 rounded-lg border border-border object-cover" />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await removeMedia(editing.media_path);
                            setEditing({ ...editing, media_url: null, media_path: null });
                          }}
                        >
                          حذف الملف
                        </Button>
                      </div>
                    )}
                    <Input
                      type="file"
                      accept={editing.media_type === "video" ? "video/*" : "image/*"}
                      disabled={uploading}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setUploading(true);
                        try {
                          const old = editing.media_path;
                          const { url, path } = await uploadMedia(f, editing.media_type === "video" ? "video" : "image");
                          await removeMedia(old);
                          setEditing({ ...editing, media_url: url, media_path: path });
                          toast.success("تم الرفع");
                        } catch (err: any) {
                          toast.error(err?.message ?? "فشل الرفع");
                        } finally {
                          setUploading(false);
                        }
                      }}
                    />
                    {uploading && <p className="text-xs text-muted-foreground">جارٍ الرفع…</p>}
                  </div>
                )}

                {editing.media_type === "video" && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-4 text-xs">
                      <label className="flex items-center gap-2">
                        <Switch checked={editing.video_autoplay} onCheckedChange={(v) => setEditing({ ...editing, video_autoplay: v })} /> تشغيل تلقائي
                      </label>
                      <label className="flex items-center gap-2">
                        <Switch checked={editing.video_muted} onCheckedChange={(v) => setEditing({ ...editing, video_muted: v })} /> كتم الصوت
                      </label>
                      <label className="flex items-center gap-2">
                        <Switch checked={editing.video_loop} onCheckedChange={(v) => setEditing({ ...editing, video_loop: v })} /> تكرار
                      </label>
                    </div>
                    <div>
                      <Label className="text-xs">صورة Poster (تظهر قبل تحميل الفيديو)</Label>
                      {editing.poster_url && (
                        <div className="flex items-center gap-3 my-2">
                          <img src={editing.poster_url} alt="" className="h-16 w-24 rounded-lg border border-border object-cover" />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              await removeMedia(editing.poster_path);
                              setEditing({ ...editing, poster_url: null, poster_path: null });
                            }}
                          >
                            حذف
                          </Button>
                        </div>
                      )}
                      <Input
                        type="file"
                        accept="image/*"
                        disabled={uploading}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setUploading(true);
                          try {
                            const old = editing.poster_path;
                            const { url, path } = await uploadMedia(f, "poster");
                            await removeMedia(old);
                            setEditing({ ...editing, poster_url: url, poster_path: path });
                          } catch (err: any) {
                            toast.error(err?.message ?? "فشل الرفع");
                          } finally {
                            setUploading(false);
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </section>

              {/* Overlay */}
              <section>
                <h3 className="text-sm font-bold">طبقة التعتيم</h3>
                <div className="grid grid-cols-3 gap-3 items-end">
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={editing.overlay_enabled} onCheckedChange={(v) => setEditing({ ...editing, overlay_enabled: v })} /> تفعيل
                  </label>
                  <div>
                    <Label className="text-xs">اللون</Label>
                    <Input type="color" value={editing.overlay_color} onChange={(e) => setEditing({ ...editing, overlay_color: e.target.value })} />
                  </div>
                  <NumField
                    label="الشفافية (%)"
                    value={Math.round(editing.overlay_opacity * 100)}
                    onChange={(n) => setEditing({ ...editing, overlay_opacity: Math.min(100, Math.max(0, n)) / 100 })}
                    max={100}
                  />
                </div>
              </section>

              {/* التخطيط */}
              <section>
                <h3 className="text-sm font-bold">أماكن العناصر والأحجام</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">أفقي</Label>
                    <Select value={editing.content_position_x} onChange={(v) => setEditing({ ...editing, content_position_x: v as any })} options={POS} />
                  </div>
                  <div>
                    <Label className="text-xs">رأسي</Label>
                    <Select value={editing.content_position_y} onChange={(v) => setEditing({ ...editing, content_position_y: v as any })} options={POS} />
                  </div>
                  <div>
                    <Label className="text-xs">محاذاة النص</Label>
                    <Select value={editing.text_align} onChange={(v) => setEditing({ ...editing, text_align: v as any })} options={POS} />
                  </div>
                  <div>
                    <Label className="text-xs">مكان الأزرار</Label>
                    <Select
                      value={editing.buttons_position}
                      onChange={(v) => setEditing({ ...editing, buttons_position: v as any })}
                      options={[
                        { value: "inline", label: "مع النص" },
                        { value: "side", label: "بجانب الكروت" },
                      ]}
                    />
                  </div>
                  <NumField label="مسافة العنوان/الوصف" value={editing.gap_title_subtitle} onChange={(n) => setEditing({ ...editing, gap_title_subtitle: n })} />
                  <NumField label="مسافة الوصف/الأزرار" value={editing.gap_subtitle_buttons} onChange={(n) => setEditing({ ...editing, gap_subtitle_buttons: n })} />
                  <NumField label="حجم العنوان (Desktop)" value={editing.title_size} onChange={(n) => setEditing({ ...editing, title_size: n })} max={72} />
                  <NumField label="حجم العنوان (Mobile)" value={editing.title_size_mobile} onChange={(n) => setEditing({ ...editing, title_size_mobile: n })} max={48} />
                  <NumField label="حجم الوصف (Desktop)" value={editing.subtitle_size} onChange={(n) => setEditing({ ...editing, subtitle_size: n })} max={32} />
                  <NumField label="حجم الوصف (Mobile)" value={editing.subtitle_size_mobile} onChange={(n) => setEditing({ ...editing, subtitle_size_mobile: n })} max={28} />
                  <NumField label="حجم الوصف الثاني (Desktop)" value={editing.subtitle2_size} onChange={(n) => setEditing({ ...editing, subtitle2_size: n })} max={32} />
                  <NumField label="حجم الوصف الثاني (Mobile)" value={editing.subtitle2_size_mobile} onChange={(n) => setEditing({ ...editing, subtitle2_size_mobile: n })} max={28} />
                  <NumField label="ارتفاع الأزرار" value={editing.button_size} onChange={(n) => setEditing({ ...editing, button_size: n })} min={32} max={64} />
                </div>
              </section>

              {/* الأزرار */}
              <section>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">الأزرار</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        buttons: [
                          ...editing.buttons,
                          { id: newId("btn"), enabled: true, label: "زر جديد", url: "/shop", icon: "none", variant: "primary" } as HeroButton,
                        ],
                      })
                    }
                  >
                    <Plus className="size-4" /> إضافة زر
                  </Button>
                </div>
                {editing.buttons.map((b, i) => (
                  <div key={b.id} className="grid grid-cols-2 items-end gap-2 rounded-md border border-border bg-background p-3 md:grid-cols-5">
                    <div>
                      <Label className="text-xs">النص</Label>
                      <Input
                        value={b.label}
                        onChange={(e) => {
                          const buttons = [...editing.buttons];
                          buttons[i] = { ...b, label: e.target.value };
                          setEditing({ ...editing, buttons });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">الرابط</Label>
                      <Input
                        value={b.url}
                        onChange={(e) => {
                          const buttons = [...editing.buttons];
                          buttons[i] = { ...b, url: e.target.value };
                          setEditing({ ...editing, buttons });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">الأيقونة</Label>
                      <Select
                        value={b.icon}
                        onChange={(v) => {
                          const buttons = [...editing.buttons];
                          buttons[i] = { ...b, icon: v };
                          setEditing({ ...editing, buttons });
                        }}
                        options={HERO_ICON_KEYS.map((k) => ({ value: k, label: k === "none" ? "بدون" : k }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">الشكل</Label>
                      <Select
                        value={b.variant}
                        onChange={(v) => {
                          const buttons = [...editing.buttons];
                          buttons[i] = { ...b, variant: v as HeroButton["variant"] };
                          setEditing({ ...editing, buttons });
                        }}
                        options={[
                          { value: "primary", label: "أساسي" },
                          { value: "teal", label: "أزرق" },
                          { value: "outline", label: "إطار" },
                        ]}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={b.enabled}
                        onCheckedChange={(v) => {
                          const buttons = [...editing.buttons];
                          buttons[i] = { ...b, enabled: v };
                          setEditing({ ...editing, buttons });
                        }}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="حذف الزر"
                        onClick={() => setEditing({ ...editing, buttons: editing.buttons.filter((x) => x.id !== b.id) })}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </section>

              {/* الكروت */}
              <section>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">الكروت الصغيرة</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        badges: [
                          ...editing.badges,
                          { id: newId("bdg"), enabled: true, title: "عنوان", value: "القيمة", icon: "Package", color: "#2f7ef7" } as HeroBadgeItem,
                        ],
                      })
                    }
                  >
                    <Plus className="size-4" /> إضافة كارت
                  </Button>
                </div>
                {editing.badges.map((b, i) => (
                  <div key={b.id} className="grid grid-cols-2 items-end gap-2 rounded-md border border-border bg-background p-3 md:grid-cols-5">
                    <div>
                      <Label className="text-xs">العنوان</Label>
                      <Input
                        value={b.title}
                        onChange={(e) => {
                          const badges = [...editing.badges];
                          badges[i] = { ...b, title: e.target.value };
                          setEditing({ ...editing, badges });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">القيمة</Label>
                      <Input
                        value={b.value}
                        onChange={(e) => {
                          const badges = [...editing.badges];
                          badges[i] = { ...b, value: e.target.value };
                          setEditing({ ...editing, badges });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">الأيقونة</Label>
                      <Select
                        value={b.icon}
                        onChange={(v) => {
                          const badges = [...editing.badges];
                          badges[i] = { ...b, icon: v };
                          setEditing({ ...editing, badges });
                        }}
                        options={HERO_ICON_KEYS.map((k) => ({ value: k, label: k === "none" ? "بدون" : k }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">لون الأيقونة</Label>
                      <Input
                        type="color"
                        value={b.color}
                        onChange={(e) => {
                          const badges = [...editing.badges];
                          badges[i] = { ...b, color: e.target.value };
                          setEditing({ ...editing, badges });
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={b.enabled}
                        onCheckedChange={(v) => {
                          const badges = [...editing.badges];
                          badges[i] = { ...b, enabled: v };
                          setEditing({ ...editing, badges });
                        }}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="حذف الكارت"
                        onClick={() => setEditing({ ...editing, badges: editing.badges.filter((x) => x.id !== b.id) })}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </section>

              <label className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-sm font-semibold">
                <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> بانر نشط
              </label>
              </div>
            </div>
          )}

          <DialogFooter className="flex-row justify-start gap-2 border-t border-border bg-card px-5 py-4 sm:px-6 sm:space-x-0">
            <Button variant="outline" className="border-border bg-secondary" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
            <Button className="min-w-24" onClick={save} disabled={saving || uploading}>
              {saving ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
