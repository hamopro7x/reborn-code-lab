import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { HeroBannerManager } from "@/components/admin/HeroBannerManager";
import { FooterManager } from "@/components/admin/FooterManager";

function SettingsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: async () => (await supabase.from("site_settings").select("*")).data ?? [] });
  const [site, setSite] = useState<any>({});
  const [banner, setBanner] = useState<any>({ enabled: true, title: "", subtitle: "" });
  useEffect(() => {
    const s = q.data?.find((x: any) => x.key === "site"); if (s) setSite(s.value);
    const b = q.data?.find((x: any) => x.key === "checkout_banner"); if (b) setBanner(b.value);
  }, [q.data]);

  async function save() {
    const { error } = await supabase.from("site_settings").update({ value: site, updated_at: new Date().toISOString() }).eq("key", "site");
    if (error) toast.error(error.message); else toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  async function saveBanner() {
    const { error } = await supabase.from("site_settings").upsert({ key: "checkout_banner", value: banner, updated_at: new Date().toISOString() });
    if (error) toast.error(error.message); else toast.success("تم حفظ البانر");
    qc.invalidateQueries({ queryKey: ["settings"] });
    qc.invalidateQueries({ queryKey: ["checkout-banner"] });
  }



  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-4">إعدادات الموقع</h2>
        <div className="card-surface rounded-2xl p-6 space-y-3">
        <div><Label>اسم الموقع</Label><Input value={site.name ?? ""} onChange={(e) => setSite({ ...site, name: e.target.value })} /></div>
        <div><Label>الوصف</Label><Input value={site.tagline ?? ""} onChange={(e) => setSite({ ...site, tagline: e.target.value })} /></div>
        <div><Label>رقم WhatsApp</Label><Input value={site.whatsapp ?? ""} onChange={(e) => setSite({ ...site, whatsapp: e.target.value })} /></div>
        <div><Label>البريد الإلكتروني</Label><Input value={site.email ?? ""} onChange={(e) => setSite({ ...site, email: e.target.value })} /></div>
        <div><Label>نص الفوتر</Label><Input value={site.footer_text ?? ""} onChange={(e) => setSite({ ...site, footer_text: e.target.value })} /></div>
        <Button onClick={save} className="gradient-primary text-white">حفظ</Button>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">بانر صفحة الشراء</h2>
        <p className="text-xs text-muted-foreground mb-3">يظهر أعلى صفحة إتمام الشراء لجذب العميل وطمأنته.</p>
        <div className="card-surface rounded-2xl p-6 space-y-3">
          <label className="flex items-center gap-2">
            <Switch checked={!!banner.enabled} onCheckedChange={(v) => setBanner({ ...banner, enabled: v })} />
            تفعيل البانر
          </label>
          <div><Label>العنوان الرئيسي</Label><Input value={banner.title ?? ""} onChange={(e) => setBanner({ ...banner, title: e.target.value })} placeholder="🎉 اطلب الآن واستلم خلال دقائق" /></div>
          <div><Label>النص الفرعي</Label><Textarea rows={2} value={banner.subtitle ?? ""} onChange={(e) => setBanner({ ...banner, subtitle: e.target.value })} placeholder="ضمان استرداد كامل • دعم مباشر • تفعيل فوري" /></div>
          <Button onClick={saveBanner} className="gradient-primary text-white">حفظ البانر</Button>
        </div>
      </div>

      <HeroBannerManager />

      <HeroBannerManager device="mobile" />

      <FooterManager />


    </div>
  );
}
