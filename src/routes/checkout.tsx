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
import { convertFromEgp, formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, CheckCircle2, Upload, ArrowLeft, Sparkles, ChevronDown } from "lucide-react";

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

const STEPS = [
  { key: "info", label: "بياناتك" },
  { key: "payment", label: "الدفع" },
  { key: "screenshot", label: "إثبات" },
  { key: "done", label: "تم" },
] as const;

function Stepper({ step }: { step: (typeof STEPS)[number]["key"] }) {
  const currentIndex = STEPS.findIndex((s) => s.key === step);
  return (
    <div className="flex items-start justify-between mb-6 sm:mb-8 px-1 sm:px-2">
      {STEPS.map((s, i) => {
        const isActive = s.key === step;
        const isPast = currentIndex > i;
        const isLast = i === STEPS.length - 1;
        return (
          <div key={s.key} className="flex items-start flex-1">
            <div className="flex flex-col items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
              <div
                className={`size-8 sm:size-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(91,83,240,0.4)]"
                    : isPast
                    ? "bg-primary/15 text-primary border border-primary/40"
                    : "bg-card text-muted-foreground border border-border"
                }`}
              >
                {i + 1}
              </div>
              <span className={`text-[10px] sm:text-xs font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
            {!isLast && (
              <div className={`h-px flex-1 mt-4 mx-1 sm:mx-2 ${isPast ? "bg-primary/40" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function OrderSummary({ total, currency, items }: { total: number; currency: any; items: any[] }) {
  return (
    <div className="card-surface rounded-2xl p-5 border border-border/60 shadow-lg">
      <h3 className="font-bold mb-3 text-sm sm:text-base">الملخص</h3>
      <div className="space-y-2 text-sm">
        {items.map((i) => (
          <div key={i.productId} className="flex justify-between gap-2 text-muted-foreground">
            <span className="truncate">{i.name} × {i.quantity}</span>
          </div>
        ))}
        <div className="border-t border-border pt-3 mt-3 flex justify-between items-center font-black text-base sm:text-lg">
          <span>الإجمالي</span>
          <span className="text-gradient">{formatPrice(total, currency)}</span>
        </div>
      </div>
    </div>
  );
}

function CheckoutPage() {
  const { items, totalEgp, clear } = useCart();
  const { currency, setCurrency, rates, currencies } = useCurrency();
  const navigate = useNavigate();
  const createOrderFn = useServerFn(createPublicOrder);
  const attachScreenshotFn = useServerFn(attachOrderScreenshot);
  const signUploadFn = useServerFn(signScreenshotUpload);
  const listPaymentsFn = useServerFn(listPublicPaymentMethods);
  const paymentDetailsFn = useServerFn(getPublicPaymentDetails);
  const [step, setStep] = useState<(typeof STEPS)[number]["key"]>("info");
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
    queryFn: async () => await listPaymentsFn({ data: { country_code: form.country_code } }),
    enabled: step === "payment",
  });
  const paymentDetailsQ = useQuery({
    queryKey: ["payment-details", selectedPayment?.id],
    queryFn: async () => await paymentDetailsFn({ data: { id: selectedPayment.id } }),
    enabled: !!selectedPayment?.id,
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
      <main className="flex-1 container mx-auto px-4 py-6 sm:py-8 max-w-4xl">
        {bannerQ.data?.enabled && (bannerQ.data.title || bannerQ.data.subtitle) && (
          <div className="mb-5 sm:mb-6 relative overflow-hidden rounded-2xl gradient-primary p-4 sm:p-6 text-primary-foreground shadow-lg animate-slide-up">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
            <div className="relative flex items-start gap-3">
              <div className="size-9 sm:size-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 backdrop-blur">
                <Sparkles className="size-5" />
              </div>
              <div className="min-w-0">
                {bannerQ.data.title && <div className="font-black text-base sm:text-lg md:text-xl">{bannerQ.data.title}</div>}
                {bannerQ.data.subtitle && <div className="text-xs sm:text-sm text-primary-foreground/90 mt-1">{bannerQ.data.subtitle}</div>}
              </div>
            </div>
          </div>
        )}

        <h1 className="text-2xl sm:text-3xl font-black text-foreground mb-4 sm:mb-6">إتمام الشراء</h1>
        <Stepper step={step} />

        {step === "info" && (
          <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
            <form onSubmit={submitInfo} className="lg:col-span-2 card-surface rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-lg border border-border/60">
              <h2 className="font-bold text-base sm:text-lg">بياناتك</h2>

              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">الاسم الكامل</Label>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                  placeholder="ادخل اسمك الثلاثي"
                  className="h-12 sm:h-10 rounded-xl bg-input border-input px-4 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">البريد الإلكتروني</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  placeholder="example@mail.com"
                  className="h-12 sm:h-10 rounded-xl bg-input border-input px-4 text-sm text-left"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">الدولة</Label>
                <div className="relative">
                  <select
                    value={form.country_code}
                    onChange={(e) => onCountryChange(e.target.value)}
                    className="w-full h-12 sm:h-10 appearance-none rounded-xl border border-input bg-input px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {(countriesQ.data ?? []).map((c: any) => (
                      <option key={c.code} value={c.code}>{c.flag} {c.name_ar} ({c.dial_code})</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">رقم الواتساب</Label>
                <div className="flex gap-2">
                  <div className="h-12 sm:h-10 min-w-[5.5rem] rounded-xl border border-input bg-input flex items-center justify-center text-sm font-mono text-muted-foreground" dir="ltr">
                    {countriesQ.data?.find((c: any) => c.code === form.country_code)?.dial_code}
                  </div>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                    placeholder="1017873279"
                    className="flex-1 h-12 sm:h-10 rounded-xl bg-input border-input px-4 text-sm text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground w-full h-12 sm:h-11 rounded-xl text-sm font-bold mt-2">
                متابعة إلى الدفع
              </Button>
            </form>

            <div className="lg:col-span-1 order-first lg:order-last">
              <OrderSummary total={total} currency={currency} items={items} />
            </div>
          </div>
        )}

        {step === "payment" && (
          <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="lg:col-span-2 space-y-3 sm:space-y-4">
              <div className="card-surface rounded-2xl p-4 sm:p-6 shadow-lg border border-border/60">
                <h2 className="font-bold text-base sm:text-lg mb-4">اختر طريقة الدفع</h2>
                <div className="space-y-2 sm:space-y-3">
                  {(paymentQ.data ?? []).map((pm: any) => (
                    <button
                      key={pm.id}
                      onClick={() => setSelectedPayment(pm)}
                      className={`w-full text-right card-surface rounded-xl p-4 hover:bg-primary/5 transition-all border ${
                        selectedPayment?.id === pm.id ? "border-primary ring-1 ring-primary" : "border-border/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-sm sm:text-base truncate">{pm.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{pm.type}</div>
                        </div>
                        {selectedPayment?.id === pm.id && <CheckCircle2 className="size-6 text-primary shrink-0" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedPayment && (
                <div className="card-surface rounded-2xl p-4 sm:p-5 border border-primary/40 shadow-lg">
                  <div className="text-sm text-muted-foreground mb-2">حوّل المبلغ إلى:</div>
                  <div className="font-mono text-xl sm:text-2xl font-black text-gradient mb-2 flex items-center gap-2 flex-wrap">
                    {paymentDetailsQ.data?.account_number ?? "..."}
                    {paymentDetailsQ.data?.account_number && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(paymentDetailsQ.data!.account_number); toast.success("تم النسخ"); }}
                        aria-label="نسخ رقم الحساب"
                        className="text-primary hover:scale-110 transition-transform"
                      >
                        <Copy className="size-5" />
                      </button>
                    )}
                  </div>
                  {paymentDetailsQ.data?.account_name && <div className="text-xs text-muted-foreground">{paymentDetailsQ.data.account_name}</div>}
                  <div className="font-bold text-sm text-primary-foreground mt-2">بعد التحويل اكد الطلب ورفع صورة الاثبات</div>
                  {paymentDetailsQ.data?.instructions && <div className="text-xs text-muted-foreground mt-2">{paymentDetailsQ.data.instructions}</div>}
                  <div className="mt-3 font-black text-base sm:text-lg">المبلغ: <span className="text-gradient">{formatPrice(total, currency)}</span></div>
                </div>
              )}

              <div className="flex gap-2 sm:gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep("info")} className="h-12 sm:h-11 px-4 rounded-xl">
                  <ArrowLeft className="size-4 ml-1" />رجوع
                </Button>
                <Button onClick={createOrder} disabled={!selectedPayment} className="bg-primary hover:bg-primary/90 text-primary-foreground flex-1 h-12 sm:h-11 rounded-xl text-sm font-bold">
                  تأكيد الطلب ورفع صورة التحويل
                </Button>
              </div>
            </div>

            <div className="lg:col-span-1 order-first lg:order-last">
              <OrderSummary total={total} currency={currency} items={items} />
            </div>
          </div>
        )}

        {step === "screenshot" && (
          <div className="card-surface rounded-2xl p-6 sm:p-8 max-w-xl mx-auto text-center shadow-lg border border-border/60">
            <div className="size-16 rounded-full gradient-primary mx-auto flex items-center justify-center mb-4">
              <Upload className="size-8 text-primary-foreground" />
            </div>
            <h2 className="font-bold text-lg sm:text-xl mb-2">ارفع صورة إثبات التحويل</h2>
            <p className="text-sm text-muted-foreground mb-6">تم إنشاء طلبك بكود: <span className="font-mono font-bold text-primary">{orderCode}</span></p>
            <label className="block cursor-pointer">
              <input type="file" accept="image/*" onChange={(e) => setScreenshotFile(e.target.files?.[0] ?? null)} className="hidden" />
              <div className="border-2 border-dashed border-primary/40 rounded-2xl p-8 hover:bg-primary/5 transition-all">
                {screenshotFile ? (
                  <>
                    <CheckCircle2 className="size-8 text-primary mx-auto mb-2" />
                    <div className="font-medium text-sm">{screenshotFile.name}</div>
                  </>
                ) : (
                  <>
                    <Upload className="size-8 text-muted-foreground mx-auto mb-2" />
                    <div className="text-sm">اضغط لاختيار الصورة</div>
                  </>
                )}
              </div>
            </label>
            <Button onClick={uploadScreenshot} disabled={!screenshotFile || uploading} className="bg-primary hover:bg-primary/90 text-primary-foreground w-full mt-6 h-12 sm:h-11 rounded-xl text-sm font-bold">
              {uploading ? "جاري الرفع..." : "إرسال الطلب"}
            </Button>
          </div>
        )}

        {step === "done" && (
          <div className="card-surface rounded-2xl p-8 text-center max-w-md mx-auto shadow-lg border border-border/60">
            <CheckCircle2 className="size-16 text-primary mx-auto mb-4" />
            <h2 className="font-bold text-xl mb-2">تم استلام طلبك</h2>
            <p className="text-sm text-muted-foreground mb-4">سنتواصل معك قريبًا لتأكيد الطلب.</p>
            <Link to="/">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground w-full h-12 rounded-xl font-bold">العودة للرئيسية</Button>
            </Link>
          </div>
        )}
      </main>
      <Footer />
      <WhatsAppFab />
    </div>
  );
}
