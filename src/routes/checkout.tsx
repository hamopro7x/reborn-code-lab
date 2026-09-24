import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { useUiState } from "@/lib/ui-state";
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
import vodafoneIcon from "@/assets/payment-icons/vodafone.svg.asset.json";
import binanceIcon from "@/assets/payment-icons/binance.svg.asset.json";
import bybitIcon from "@/assets/payment-icons/bybit.png.asset.json";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Copy,
  CreditCard,
  ImageUp,
  Mail,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Upload,
  UserRound,
} from "lucide-react";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
  head: () => ({
    meta: [
      { title: "إتمام الشراء | متجر الاشتراكات الرقمية" },
      { name: "description", content: "أكمل بيانات طلبك واختر وسيلة الدفع المناسبة لك لاستلام اشتراكك الرقمي فورًا بعد التأكيد." },
      { property: "og:title", content: "إتمام الشراء | متجر الاشتراكات الرقمية" },
      { property: "og:description", content: "أكمل بيانات طلبك واختر وسيلة الدفع المناسبة لك لاستلام اشتراكك الرقمي فورًا بعد التأكيد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  { key: "cart", label: "المنتج" },
  { key: "info", label: "البيانات" },
  { key: "payment", label: "الدفع" },
  { key: "screenshot", label: "التأكيد" },
] as const;

type CheckoutStep = "info" | "payment" | "screenshot" | "done";

const PAYMENT_ICONS = [
  { terms: ["vodafone", "فودافون"], src: vodafoneIcon.url },
  { terms: ["binance", "بينانس"], src: binanceIcon.url },
  { terms: ["bybit", "بايبت", "باي بيت"], src: bybitIcon.url },
] as const;

function getPaymentIconMatch(method: any) {
  const searchableName = `${method?.name ?? ""} ${method?.type ?? ""}`.toLowerCase();
  return PAYMENT_ICONS.find(({ terms }) => terms.some((term) => searchableName.includes(term)));
}

function PaymentMethodIcon({ method }: { method: any }) {
  const match = getPaymentIconMatch(method);
  const customIcon = String(method?.icon ?? "").trim();
  const customImage = /^(https?:\/\/|\/)/i.test(customIcon);

  return (
    <span className="checkout-payment-icon-shell" aria-hidden="true">
      {customImage
        ? <img src={customIcon} alt="" />
        : customIcon
          ? <span className="text-xl leading-none">{customIcon}</span>
          : match
            ? <img src={match.src} alt="" />
            : <CreditCard className="checkout-payment-icon" />}
    </span>
  );
}

function Stepper({ step }: { step: CheckoutStep }) {
  const displayStep = step === "done" ? "screenshot" : step;
  const currentIndex = STEPS.findIndex((s) => s.key === displayStep);
  return (
    <div className="checkout-steps">
      {STEPS.map((s, i) => {
        const isActive = s.key === displayStep;
        const isPast = currentIndex > i;
        return (
          <div key={s.key} className="checkout-step">
            {i > 0 && <span className={`checkout-step-line ${i <= currentIndex ? "is-done" : ""}`} />}
            <span className={`checkout-step-circle ${isActive ? "is-active" : ""} ${isPast ? "is-done" : ""}`}>
              {isPast ? <Check aria-hidden="true" /> : i + 1}
            </span>
            <span className={`checkout-step-label ${isActive || isPast ? "is-on" : ""}`}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function OrderSummary({ total, originalTotal, currency, items }: { total: number; originalTotal: number; currency: any; items: any[] }) {
  const discount = Math.max(0, originalTotal - total);
  return (
    <section className="checkout-summary" aria-label="ملخص الطلب">
      <div className="checkout-summary-head">
        <ShoppingBag className="checkout-summary-icon" aria-hidden="true" />
        <div className="min-w-0">
          <h2>{items[0]?.name ?? "طلبك"}{items.length > 1 ? ` و${items.length - 1} منتجات أخرى` : ""}</h2>
          <p>{items.reduce((sum, item) => sum + item.quantity, 0)} منتج · تفعيل بعد تأكيد الدفع</p>
        </div>
      </div>
      <div className="checkout-price-lines">
        <div><span>السعر الأصلي</span><b className={discount > 0 ? "is-old" : ""}>{formatPrice(originalTotal, currency)}</b></div>
        {discount > 0 && <div className="is-discount"><span>الخصم</span><b>− {formatPrice(discount, currency)}</b></div>}
        <div className="is-total"><span>الإجمالي</span><b>{formatPrice(total, currency)}</b></div>
      </div>
    </section>
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
  const [step, setStep] = useUiState<CheckoutStep>("checkout", "step", "info");
  const [form, setForm] = useUiState("checkout", "form", { full_name: "", email: "", phone: "", country_code: "EG" });
  const [selectedPayment, setSelectedPayment] = useUiState<any>("checkout", "payment", null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [orderCode, setOrderCode] = useUiState<string>("checkout", "order", "");

  const countriesQ = useQuery({
    queryKey: ["countries"],
    queryFn: async () => (await supabase.from("countries").select("*").eq("active", true).order("sort_order")).data ?? [],
  });
  const paymentQ = useQuery({
    queryKey: ["payments", form.country_code],
    queryFn: async () => await listPaymentsFn({ data: { country_code: form.country_code } }),
    enabled: step === "payment",
  });
  const paymentDetailsQ = useQuery({
    queryKey: ["payment-details", selectedPayment?.id],
    queryFn: async (): Promise<any> => await paymentDetailsFn({ data: { id: selectedPayment.id } }),
    enabled: !!selectedPayment?.id,
  });

  const rate = rates[currency.code] ?? 1;
  const total = useMemo(() => convertFromEgp(totalEgp, rate, currency.code), [totalEgp, rate, currency.code]);
  const originalTotal = useMemo(
    () => convertFromEgp(items.reduce((sum, item) => sum + item.basePriceEgp * item.quantity, 0), rate, currency.code),
    [items, rate, currency.code],
  );

  function onCountryChange(code: string) {
    setForm({ ...form, country_code: code });
    const c = countriesQ.data?.find((x: any) => x.code === code);
    if (c) {
      const cur = currencies.find((cc) => cc.code === c.currency_code);
      if (cur) setCurrency(cur);
    }
  }

  function copyText(value: string) {
    if (!value) return;
    navigator.clipboard.writeText(value);
    toast.success("تم النسخ");
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
    <div className="checkout-v4 min-h-screen" dir="rtl">
      <main className="checkout-shell">
        <header className="checkout-appbar">
          <Button variant="ghost" size="icon" onClick={() => history.back()} aria-label="رجوع" className="checkout-back">
            <ArrowLeft aria-hidden="true" />
          </Button>
          <h1>إتمام الطلب</h1>
          <a href="https://wa.me/201120373986" target="_blank" rel="noreferrer" className="checkout-help">
            مساعدة <CircleHelp aria-hidden="true" />
          </a>
        </header>

        <Stepper step={step} />

        <div className="checkout-content">
        {step === "info" && (
          <form onSubmit={submitInfo}>
            <OrderSummary total={total} originalTotal={originalTotal} currency={currency} items={items} />

            <h2 className="checkout-section-title">بياناتك</h2>
            <p className="checkout-section-subtitle">لتفعيل الاشتراك والتواصل معاك</p>

            <div className="checkout-field">
              <Label htmlFor="checkout-name">الاسم</Label>
              <div className="checkout-field-shell">
                <UserRound aria-hidden="true" />
                <Input id="checkout-name"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                  placeholder="ادخل اسمك"
                />
              </div>
            </div>

            <div className="checkout-field">
              <Label htmlFor="checkout-email">البريد الإلكتروني</Label>
              <div className="checkout-field-shell">
                <Mail aria-hidden="true" />
                <Input id="checkout-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  placeholder="example@mail.com"
                  dir="ltr"
                  className="text-right"
                />
              </div>
            </div>

            <div className="checkout-field">
              <Label htmlFor="checkout-country">الدولة</Label>
              <div className="checkout-field-shell checkout-select-shell">
                <select id="checkout-country"
                    value={form.country_code}
                    onChange={(e) => onCountryChange(e.target.value)}
                  >
                    {(countriesQ.data ?? []).map((c: any) => (
                      <option key={c.code} value={c.code}>{c.flag} {c.name_ar} ({c.dial_code})</option>
                    ))}
                  </select>
                <ChevronDown aria-hidden="true" />
              </div>
            </div>

            <div className="checkout-field">
              <Label htmlFor="checkout-phone">رقم الواتساب</Label>
              <div className="checkout-phone-group">
                <div className="checkout-field-shell checkout-code" dir="ltr">
                    {countriesQ.data?.find((c: any) => c.code === form.country_code)?.dial_code}
                </div>
                <div className="checkout-field-shell checkout-phone">
                  <Phone aria-hidden="true" />
                  <Input id="checkout-phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                    placeholder="0000000000"
                    dir="ltr"
                    className="text-right"
                  />
                </div>
              </div>
            </div>

            <div className="checkout-cta-footer">
              <Button type="submit" className="checkout-cta">
                متابعة إلى الدفع
                <ArrowLeft aria-hidden="true" />
              </Button>
              <p><ShieldCheck aria-hidden="true" /> بياناتك محمية ومشفّرة بالكامل</p>
            </div>
          </form>
        )}

        {step === "payment" && (
          <div className="checkout-payment-step">
              <section className="checkout-payment-card" aria-labelledby="payment-heading">
                <h2 id="payment-heading" className="checkout-section-title">اختر طريقة الدفع</h2>
                <div className="checkout-payment-list">
                  {(paymentQ.data ?? []).map((pm: any) => (
                    <div key={pm.id} className={`checkout-payment-item ${selectedPayment?.id === pm.id ? "is-selected" : ""}`}>
                      <Button variant="ghost"
                        onClick={() => setSelectedPayment(pm)}
                        className="checkout-payment-option"
                        aria-pressed={selectedPayment?.id === pm.id}
                      >
                        <PaymentMethodIcon method={pm} />
                        <div>
                          <strong>{pm.name}</strong>
                        </div>
                      </Button>
                      {selectedPayment?.id === pm.id && (
                        <div className="checkout-transfer">
                          {paymentDetailsQ.data?.display_type === "crypto" ? (
                            <div className="checkout-binance-network-box">
                              <div className="checkout-binance-field-group">
                                <span className="checkout-field-label">{paymentDetailsQ.data?.account_label || "عنوان الشبكة"}</span>
                                <div className="checkout-binance-field">
                                  <span className="checkout-field-value" dir="ltr">{paymentDetailsQ.data?.account_number ?? "..."}</span>
                                  {paymentDetailsQ.data?.account_number && (
                                    <Button variant="ghost"
                                      onClick={() => copyText(paymentDetailsQ.data.account_number)}
                                      aria-label={`نسخ ${paymentDetailsQ.data?.account_label || "العنوان"}`}
                                      className="checkout-copy checkout-small-copy"
                                    >
                                      نسخ
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {paymentDetailsQ.data?.show_account_name !== false && paymentDetailsQ.data?.account_name && (
                                <div className="checkout-binance-field-group">
                                  <span className="checkout-field-label">{paymentDetailsQ.data?.account_name_label || "اسم الشبكة"}</span>
                                  <div className="checkout-binance-field checkout-network-name-field">
                                    {paymentDetailsQ.data?.network_icon && (
                                      <span className="checkout-network-icon" aria-hidden="true">
                                        <img src={paymentDetailsQ.data.network_icon} alt="" />
                                      </span>
                                    )}
                                    <span className="checkout-field-value">{paymentDetailsQ.data.account_name}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="checkout-pay-to-row">
                                <div className="min-w-0">
                                  <p>{paymentDetailsQ.data?.account_label || "رقم الحساب"}</p>
                                  <div className="checkout-account-number" dir="ltr">
                                    {paymentDetailsQ.data?.account_number ?? "..."}
                                  </div>
                                </div>
                                {paymentDetailsQ.data?.account_number && (
                                  <Button variant="ghost"
                                    onClick={() => copyText(paymentDetailsQ.data.account_number)}
                                    aria-label="نسخ رقم الحساب"
                                    className="checkout-copy"
                                  >
                                    <Copy /> نسخ
                                  </Button>
                                )}
                              </div>
                              {paymentDetailsQ.data?.show_account_name !== false && paymentDetailsQ.data?.account_name && (
                                <small className="checkout-recipient"><UserRound aria-hidden="true" /> {paymentDetailsQ.data?.account_name_label || "اسم صاحب الحساب"}: {paymentDetailsQ.data.account_name}</small>
                              )}
                            </>
                          )}
                           {paymentDetailsQ.data?.show_instructions !== false && paymentDetailsQ.data?.instructions && <p>{paymentDetailsQ.data.instructions}</p>}
                           {paymentDetailsQ.data?.show_amount !== false && <div className="checkout-transfer-total"><span>المبلغ المطلوب تحويله</span><b>{formatPrice(total, currency)}</b></div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <div className="checkout-actions">
                <Button variant="outline" onClick={() => setStep("info")}>
                  رجوع
                </Button>
                <Button onClick={createOrder} disabled={!selectedPayment} className="checkout-cta">
                  تأكيد طلب الدفع
                  <ArrowLeft aria-hidden="true" />
                </Button>
              </div>
          </div>
        )}

        {step === "screenshot" && (
          <section className="checkout-upload-card">
            <ImageUp className="checkout-upload-icon" aria-hidden="true" />
            <h2>ارفع صورة إثبات التحويل</h2>
            <p>تم إنشاء طلبك بكود: <b>{orderCode}</b></p>
            <label className="checkout-upload-zone">
              <input type="file" accept="image/*" onChange={(e) => setScreenshotFile(e.target.files?.[0] ?? null)} className="hidden" />
                {screenshotFile ? (
                  <>
                    <CheckCircle2 />
                    <span>{screenshotFile.name}</span>
                  </>
                ) : (
                  <>
                    <Upload />
                    <span>اضغط لاختيار الصورة</span>
                  </>
                )}
            </label>
            <div className="checkout-upload-actions">
              <Button variant="outline" onClick={() => setStep("payment")}>رجوع</Button>
              <Button onClick={uploadScreenshot} disabled={!screenshotFile || uploading} className="checkout-cta">
                {uploading ? "جاري الرفع..." : "إرسال الطلب"}
              </Button>
            </div>
          </section>
        )}

        {step === "done" && (
          <div className="checkout-summary checkout-upload-card">
            <CheckCircle2 className="checkout-done-icon" />
            <h2>تم استلام طلبك</h2>
            <p>سنتواصل معك قريبًا لتأكيد الطلب.</p>
            <Link to="/" className="block">
              <Button className="checkout-cta">العودة للرئيسية</Button>
            </Link>
          </div>
        )}
        </div>
      </main>
      <WhatsAppFab className="bottom-5 right-5 left-auto" showLabel={false} />
    </div>
  );
}
