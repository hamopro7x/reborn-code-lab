import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/lib/currency-context";
import { useCart } from "@/lib/cart";
import { convertFromEgp, formatPrice, computeDiscountedPrice } from "@/lib/format";
import { SafeImage } from "@/components/site/SafeImage";
import { Coins, ShieldCheck, Zap, Star } from "lucide-react";

const TITLE = "شحن عملات تيك توك | MG Pro";
const DESC = "اشحن عملات تيك توك بأسعار مناسبة: اختر الباقة، أكمل الدفع، وتابع حالة الشحن من صفحة الطلب.";

export const Route = createFileRoute("/tiktok")({
  component: TikTokPage,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mag-pro1.com/tiktok" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESC },
    ],
    links: [{ rel: "canonical", href: "https://mag-pro1.com/tiktok" }],
  }),
});

const STEPS = [
  "اختر باقة العملات المناسبة وأكمل الطلب.",
  "افتح تطبيق تيك توك على هاتفك وتأكد من تسجيل الدخول إلى الحساب المطلوب شحنه.",
  "اضغط على «الملف الشخصي» ثم أيقونة القائمة أعلى الشاشة واختر رمز الاستجابة السريعة.",
  "اضغط على أيقونة المسح لفتح الكاميرا داخل التطبيق.",
  "وجّه الكاميرا إلى رمز QR الذي يرسله لك فريقنا بعد تأكيد الطلب.",
  "وافق على تأكيد الجلسة من هاتفك دون إدخال أي كلمة مرور.",
  "انتظر ظهور إشعار اكتمال العملية.",
  "افتح محفظة العملات في التطبيق وتأكد من وصول الرصيد.",
];

function TikTokPage() {
  const { currency, rates } = useCurrency();
  const rate = rates[currency.code] ?? 1;
  const { add } = useCart();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);

  const { data: packs = [], isLoading } = useQuery({
    queryKey: ["tiktok-coin-packs"],
    queryFn: async () => {
      const { data: cat } = await supabase.from("categories").select("id").eq("slug", "tiktok-coins").maybeSingle();
      if (!cat) return [];
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("category_id", cat.id)
        .eq("active", true)
        .order("base_price_egp");
      return data ?? [];
    },
  });

  const unit: any = (packs as any[]).find((p) => p.slug === "tiktok-coin-unit");
  const gridPacks: any[] = (packs as any[]).filter((p) => p.slug !== "tiktok-coin-unit");
  const [coins, setCoins] = useState("");
  const coinsNum = Math.floor(Number(coins) || 0);
  const coinsValid = coinsNum >= 10 && coinsNum <= 100000;
  const buyCustom = () => {
    if (!unit || !coinsValid) return;
    add({
      productId: unit.id, slug: unit.slug, name: unit.name, image: unit.main_image,
      basePriceEgp: Number(unit.base_price_egp), discountPercent: unit.discount_percent ?? 0,
      warrantyDays: unit.warranty_days ?? 0,
    }, coinsNum);
    navigate({ to: "/checkout" });
  };
  const pack: any = packs.find((p: any) => p.id === selected);
  const cheapestPerUnit = packs.length
    ? packs.reduce((best: any, p: any) => (p.discount_percent ?? 0) > (best.discount_percent ?? 0) ? p : best, packs[0])?.id
    : null;

  const buy = () => {
    if (!pack) return;
    add({
      productId: pack.id, slug: pack.slug, name: pack.name, image: pack.main_image,
      basePriceEgp: Number(pack.base_price_egp), discountPercent: pack.discount_percent ?? 0,
      warrantyDays: pack.warranty_days ?? 0,
    });
    navigate({ to: "/checkout" });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl space-y-6">
        <section className="card-surface rounded-3xl p-6 flex items-center gap-4">
          <div className="size-16 rounded-2xl gradient-primary flex items-center justify-center shrink-0">
            <Coins className="size-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-gradient">تيك توك</h1>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-0.5">رائج</span>
              <span className="rounded-full bg-muted px-2 py-0.5">شحن رقمي</span>
              <span className="flex items-center gap-1"><Star className="size-3 text-primary" /> شحن بدون كلمة مرور</span>
            </div>
          </div>
        </section>

        <section className="card-surface rounded-3xl p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <span className="size-7 rounded-full gradient-primary text-primary-foreground flex items-center justify-center text-sm">1</span>
            اختر الباقة
          </h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">جارِ التحميل…</p>
          ) : gridPacks.length === 0 ? (
            <p className="text-sm text-muted-foreground">الباقات هتتضاف قريبًا.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {gridPacks.map((p: any) => {
                const final = convertFromEgp(computeDiscountedPrice(p.base_price_egp, p.discount_percent ?? 0), rate, currency.code);
                const orig = convertFromEgp(p.base_price_egp, rate, currency.code);
                const active = p.id === selected;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected(p.id)}
                    className={`relative rounded-2xl border p-3 text-center transition-colors ${active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/60"}`}
                  >
                    {(p.discount_percent ?? 0) > 0 && (
                      <span className="absolute top-2 left-2 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">−{p.discount_percent}%</span>
                    )}
                    {p.id === cheapestPerUnit && (p.discount_percent ?? 0) > 0 && (
                      <span className="absolute top-2 right-2 text-[10px] text-primary font-bold">الأوفر</span>
                    )}
                    <div className="mx-auto mt-4 size-12 overflow-hidden rounded-full">
                      <SafeImage src={p.main_image ?? undefined} alt={p.name} width={96} height={96} className="size-full object-cover" fallbackClassName="[&_span]:hidden" />
                    </div>
                    <div className="mt-2 text-sm font-bold">{p.name}</div>
                    <div className="mt-1 text-base font-black">{formatPrice(final, currency)}</div>
                    {(p.discount_percent ?? 0) > 0 && (
                      <div className="text-xs text-muted-foreground line-through">{formatPrice(orig, currency)}</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <Button onClick={buy} disabled={!pack} className="mt-5 w-full h-12 gradient-primary">
            {pack ? `اشحن ${pack.name} الآن` : "اختر باقة للمتابعة"}
          </Button>
          {unit && (
            <div className="mt-5 rounded-2xl border border-border p-4 space-y-3">
              <h3 className="font-bold text-sm">أو اكتب عدد العملات اللي عايزه</h3>
              <input type="number" inputMode="numeric" min={10} max={100000} value={coins} onChange={(e) => setCoins(e.target.value)} placeholder="مثلاً 1500" className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm" />
              <div className="text-sm text-muted-foreground">السعر: <span className="font-black text-foreground">{formatPrice(convertFromEgp(computeDiscountedPrice(unit.base_price_egp, unit.discount_percent ?? 0) * (coinsValid ? coinsNum : 0), rate, currency.code), currency)}</span> <span className="text-xs">(من 10 لحد 100,000 عملة)</span></div>
              <Button onClick={buyCustom} disabled={!coinsValid} className="w-full h-11 gradient-primary">اشحن {coinsValid ? coinsNum : ""} عملة</Button>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground text-center">بعد تأكيد الدفع، تابع حالة تنفيذ الشحن من صفحة «تتبع طلبك».</p>
        </section>

        <section className="card-surface rounded-3xl p-6 space-y-4 text-sm leading-7">
          <h2 className="text-xl font-black">عن المنتج</h2>
          <p className="text-muted-foreground">عملات تيك توك هي العملة داخل التطبيق التي تُستخدم لإرسال الهدايا الرقمية أثناء البث المباشر ودعم صنّاع المحتوى. الشحن يتم على حسابك مباشرة عبر مسح رمز QR من التطبيق، دون طلب كلمة المرور.</p>
          <h3 className="font-bold flex items-center gap-2"><Zap className="size-4 text-primary" /> ماذا تحصل عليه</h3>
          <ul className="list-disc pr-5 text-muted-foreground space-y-1">
            <li>رصيد عملات يُضاف إلى محفظة التطبيق باسم حسابك نفسه.</li>
            <li>باقات متدرجة تناسب كل الاستخدامات.</li>
            <li>إمكانية إرسال الهدايا الرقمية في البثوث المباشرة.</li>
            <li>شحن بمسح رمز QR فقط، بلا مشاركة كلمة مرور أو رمز تحقق.</li>
          </ul>
          <h3 className="font-bold flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> هل الشحن بمسح رمز QR آمن؟</h3>
          <ul className="list-disc pr-5 text-muted-foreground space-y-1">
            <li>الجلسة تُفتح من هاتفك أنت داخل تطبيق تيك توك الرسمي، والمسح يعادل تأكيدًا منك.</li>
            <li>لا نطلب البريد أو رقم الهاتف أو كلمة المرور.</li>
            <li>تبقى إعدادات الحساب والمحادثات كما هي؛ العملية لإضافة الرصيد فقط.</li>
          </ul>
          <h3 className="font-bold">الفرق بين الباقات</h3>
          <ul className="list-disc pr-5 text-muted-foreground space-y-1">
            <li>الباقات الصغيرة مناسبة لمن يرسل هدايا رمزية بين حين وآخر.</li>
            <li>الباقات المتوسطة تناسب متابعي البث اليومي.</li>
            <li>الباقات الكبيرة للداعمين الكبار والهدايا مرتفعة القيمة.</li>
          </ul>
        </section>

        <section className="card-surface rounded-3xl p-6">
          <h2 className="text-xl font-black mb-4">طريقة الشحن</h2>
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="size-7 shrink-0 rounded-full gradient-primary text-primary-foreground flex items-center justify-center font-bold">{i + 1}</span>
                <span className="pt-1 text-muted-foreground">{s}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <Footer />
    </div>
  );
}
