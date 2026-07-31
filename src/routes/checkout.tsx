import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { createPublicOrder, attachOrderScreenshot, signScreenshotUpload } from "@/lib/orders.functions";
import { listPublicPaymentMethods, getPublicPaymentDetails } from "@/lib/payments.functions";
import { getCachedFingerprint } from "@/lib/device-session";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { useCart } from "@/lib/cart";
import { useCurrency } from "@/lib/currency-context";
import { convertFromEgp, formatPrice, computeDiscountedPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, CheckCircle2, Upload, ArrowLeft, Sparkles } from "lucide-react";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
  head: () => ({
    meta: [
      { title: "إتمام الشراء | متجر الاشتراكات الرقمية" },
      { name: "description", content: "أكمل بيانات طلبك واختر وسيلة الدفع المناسبة لك لاستلام اشتراكك الرقمي فورًا بعد التأكيد." },
      { property: "og:title", content: "إتمام الشراء | متجر الاشتراكات الرقمية" },
      { property: "og:description", content: "أكمل بيانات طلبك واختر وسيلة الدفع المناسبة لك لاستلام اشتراكك الرقمي فورًا بعد التأكيد." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const formSchema = z.object({
  full_name: z.string().trim().min(2, "الاسم مطلوب").max(80),
  email: z.string().trim().email("بريد غير صحيح").max(200),
  phone: z.string().trim().min(5, "رقم الهاتف مطلوب").max(30),
  country_code: z.string().min(2),
});

function CheckoutPage() {
  const { items, totalEgp, clear } = useCart();
  const { currency, setCurrency, rates, currencies } = useCurrency();
  const navigate = useNavigate();
  const createOrderFn = useServerFn(createPublicOrder);
  const attachScreenshotFn = useServerFn(attachOrderScreenshot);
  const signUploadFn = useServerFn(signScreenshotUpload);
  const [step, setStep] = useState<"info" | "payment" | "screenshot" | "done">("info");
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", country_code: "EG" });
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [orderCode, setOrderCode] = useState<string>("");

  const countriesQ = useQuery({
    queryKey: ["countries"],
    queryFn: async () => (await supabase.from("countries").select("*").eq("active", true).order("sort_order")).data ?? [],
  });
  const bannerQ = useQuery({
    queryKey: ["checkout-banner"],
    queryFn: async () => (await supabase.from("site_settings").select("value").eq("key", "checkout_banner").maybeSingle()).data?.value as any,
  });
  const paymentQ = useQuery({
    queryKey: ["payments", form.country_code],
    queryFn: async () => {
      const { data } = await supabase.from("payment_methods").select("*").eq("active", true).or(`country_code.eq.${form.country_code},country_code.is.null`).order("sort_order");
      return data ?? [];
    },
    enabled: step === "payment",
  });

  const rate = rates[currency.code] ?? 1;
  const total = useMemo(() => convertFromEgp(totalEgp, rate, currency.code), [totalEgp, rate, currency.code]);

  function onCountryChange(code: string) {
    setForm({ ...form, country_code: code });
    const c = countriesQ.data?.find((x: any) => x.code === code);
    if (c) {
      const cur = currencies.find((cc) => cc.code === c.currency_code);
      if (cur) setCurrency(cur);
    }
  }

  async function submitInfo(e: React.FormEvent) {
    e.preventDefault();
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    if (!items.length) { toast.error("السلة فارغة"); return; }
    setStep("payment");
  }

  async function createOrder() {
    if (!selectedPayment) { toast.error("اختر طريقة الدفع"); return; }
    const country = countriesQ.data?.find((c: any) => c.code === form.country_code);
    if (!country) { toast.error("اختر الدولة"); return; }

    try {
      const res = await createOrderFn({
        data: {
          customer_name: form.full_name,
          customer_email: form.email,
          customer_phone: form.phone,
          customer_country: form.country_code,
          dial_code: country.dial_code,
          currency_code: currency.code,
          payment_method_id: selectedPayment.id,
          device_id: await getCachedFingerprint().catch(() => undefined),
          items: items.map((i) => ({
            product_id: i.productId,
            quantity: i.quantity,
          })),
        },
      });
      setOrderCode(res.order_code);
      setStep("screenshot");
    } catch (e: any) {
      toast.error("فشل إنشاء الطلب: " + (e?.message ?? ""));
    }
  }

  async function uploadScreenshot() {
    if (!screenshotFile || !orderCode) return;
    setUploading(true);
    try {
      const ext = (screenshotFile.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const { path, token } = await signUploadFn({ data: { order_code: orderCode, ext } });
      const { error: upErr } = await supabase.storage
        .from("payment-screenshots")
        .uploadToSignedUrl(path, token, screenshotFile, { contentType: screenshotFile.type || undefined });
      if (upErr) throw upErr;
      await attachScreenshotFn({ data: { order_code: orderCode, screenshot_path: path } });
      clear();
      navigate({ to: "/order/$code", params: { code: orderCode } });
    } catch (e: any) {
      toast.error("فشل الرفع: " + e.message);
    } finally { setUploading(false); }
  }

  if (items.length === 0 && step === "info") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-16 text-center">
          <p className="text-muted-foreground mb-4">سلتك فارغة</p>
          <Link to="/shop"><Button>تصفح المتجر</Button></Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        {bannerQ.data?.enabled && (bannerQ.data.title || bannerQ.data.subtitle) && (
          <div className="mb-6 relative overflow-hidden rounded-2xl gradient-primary p-5 md:p-6 text-white shadow-lg animate-slide-up">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
            <div className="relative flex items-start gap-3">
              <div className="size-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 backdrop-blur">
                <Sparkles className="size-5" />
              </div>
              <div className="min-w-0">
                {bannerQ.data.title && <div className="font-black text-lg md:text-xl">{bannerQ.data.title}</div>}
                {bannerQ.data.subtitle && <div className="text-sm text-white/90 mt-1">{bannerQ.data.subtitle}</div>}
              </div>
            </div>
          </div>
        )}
        <h1 className="text-3xl font-black text-gradient mb-6">إتمام الشراء</h1>

        <div className="flex items-center gap-2 mb-8 text-sm">
          {[["info","بياناتك"],["payment","الدفع"],["screenshot","إثبات التحويل"],["done","تم"]].map(([k,l],i) => (
            <div key={k} className="flex items-center gap-2">
              <div className={`size-8 rounded-full flex items-center justify-center font-bold text-xs ${step === k || (["payment","screenshot","done"].indexOf(step) > ["payment","screenshot","done"].indexOf(k as any)) ? "gradient-primary text-white" : "card-surface"}`}>{i+1}</div>
              <span className={step === k ? "font-bold" : "text-muted-foreground"}>{l}</span>
              {i < 3 && <div className="w-8 h-px bg-border mx-1" />}
            </div>
          ))}
        </div>

        {step === "info" && (
          <form onSubmit={submitInfo} className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 card-surface rounded-2xl p-6 space-y-4">
              <h2 className="font-bold text-lg mb-2">بياناتك</h2>
              <div><Label>الاسم الكامل</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
              <div><Label>البريد الإلكتروني</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
              <div>
                <Label>الدولة</Label>
                <select value={form.country_code} onChange={(e) => onCountryChange(e.target.value)} className="w-full h-10 rounded-md border border-input bg-input px-3 text-sm">
                  {(countriesQ.data ?? []).map((c: any) => <option key={c.code} value={c.code}>{c.flag} {c.name_ar} ({c.dial_code})</option>)}
                </select>
              </div>
              <div>
                <Label>رقم الواتساب</Label>
                <div className="flex gap-2">
                  <div className="w-24 h-10 rounded-md border border-input bg-input flex items-center justify-center text-sm font-mono">
                    {countriesQ.data?.find((c: any) => c.code === form.country_code)?.dial_code}
                  </div>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required placeholder="1017873279" />
                </div>
              </div>
              <Button type="submit" className="bg-black hover:bg-black/90 text-white w-full h-10 text-sm">متابعة إلى الدفع</Button>
            </div>
            <div className="card-surface rounded-2xl p-6 h-fit">
              <h3 className="font-bold mb-4">الملخص</h3>
              <div className="space-y-2 text-sm">
                {items.map((i) => (
                  <div key={i.productId} className="flex justify-between">
                    <span className="truncate">{i.name} × {i.quantity}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-2 mt-2 flex justify-between font-black text-lg">
                  <span>الإجمالي</span>
                  <span className="text-gradient">{formatPrice(total, currency)}</span>
                </div>
              </div>
            </div>
          </form>
        )}

        {step === "payment" && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-3">
              <h2 className="font-bold text-lg mb-2">اختر طريقة الدفع</h2>
              {(paymentQ.data ?? []).map((pm: any) => (
                <button key={pm.id} onClick={() => setSelectedPayment(pm)} className={`w-full text-right card-surface rounded-2xl p-5 hover:bg-primary/5 transition-all ${selectedPayment?.id === pm.id ? "glow-purple ring-2 ring-primary" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold">{pm.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{pm.type}</div>
                    </div>
                    {selectedPayment?.id === pm.id && <CheckCircle2 className="size-6 text-primary" />}
                  </div>
                </button>
              ))}
              {selectedPayment && (
                <div className="card-surface rounded-2xl p-5 mt-4 border-2 border-primary/40">
                  <div className="text-sm text-muted-foreground mb-2">حوّل المبلغ إلى:</div>
                  <div className="font-mono text-2xl font-black text-gradient mb-2 flex items-center gap-2">
                    {selectedPayment.account_number}
                    <button onClick={() => { navigator.clipboard.writeText(selectedPayment.account_number); toast.success("تم النسخ"); }} aria-label="نسخ رقم الحساب" className="text-primary hover:scale-110 transition-transform">
                      <Copy className="size-5" />
                    </button>
                  </div>
                  <div className="font-bold text-sm text-white mt-2">بعد التحويل اكد الطلب ورفع صورة الاثبات</div>
                  {selectedPayment.instructions && <div className="text-xs text-muted-foreground mt-2">{selectedPayment.instructions}</div>}
                  <div className="mt-3 font-black text-lg">المبلغ: <span className="text-gradient">{formatPrice(total, currency)}</span></div>
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => setStep("info")}><ArrowLeft className="size-4 ml-1" />رجوع</Button>
                <Button onClick={createOrder} disabled={!selectedPayment} className="bg-black hover:bg-black/90 text-white flex-1 h-10 text-sm">تأكيد الطلب ورفع صورة التحويل</Button>
              </div>
            </div>
            <div className="card-surface rounded-2xl p-6 h-fit">
              <h3 className="font-bold mb-4">الإجمالي</h3>
              <div className="text-2xl font-black text-gradient">{formatPrice(total, currency)}</div>
            </div>
          </div>
        )}

        {step === "screenshot" && (
          <div className="card-surface rounded-2xl p-8 max-w-xl mx-auto text-center">
            <div className="size-16 rounded-full gradient-primary mx-auto flex items-center justify-center mb-4 glow-purple">
              <Upload className="size-8 text-white" />
            </div>
            <h2 className="font-bold text-xl mb-2">ارفع صورة إثبات التحويل</h2>
            <p className="text-sm text-muted-foreground mb-6">تم إنشاء طلبك بكود: <span className="font-mono font-bold text-primary">{orderCode}</span></p>
            <label className="block cursor-pointer">
              <input type="file" accept="image/*" onChange={(e) => setScreenshotFile(e.target.files?.[0] ?? null)} className="hidden" />
              <div className="border-2 border-dashed border-primary/40 rounded-2xl p-8 hover:bg-primary/5 transition-all">
                {screenshotFile ? (
                  <>
                    <CheckCircle2 className="size-8 text-primary mx-auto mb-2" />
                    <div className="font-medium">{screenshotFile.name}</div>
                  </>
                ) : (
                  <>
                    <Upload className="size-8 text-muted-foreground mx-auto mb-2" />
                    <div className="text-sm">اضغط لاختيار الصورة</div>
                  </>
                )}
              </div>
            </label>
            <Button onClick={uploadScreenshot} disabled={!screenshotFile || uploading} className="bg-black hover:bg-black/90 text-white w-full mt-6 h-10 text-sm">
              {uploading ? "جاري الرفع..." : "إرسال الطلب"}
            </Button>
          </div>
        )}
      </main>
      <Footer />
      <WhatsAppFab />
    </div>
  );
}
