import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/lib/currency-context";
import { convertFromEgp, formatPrice, computeDiscountedPrice } from "@/lib/format";
import { useCart } from "@/lib/cart";
import { ShoppingCart, ShieldCheck, Sparkles, Star, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ProductCard } from "@/components/site/ProductCard";

export const Route = createFileRoute("/product/$slug")({
  component: ProductPage,
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("products")
      .select("*, category:categories(id,slug,name,icon)")
      .eq("slug", params.slug)
      .eq("active", true)
      .maybeSingle();
    return { product: data };
  },
  head: ({ params, loaderData }) => {
    const p = loaderData?.product as any;
    const url = `https://mag-pro1.com/product/${params.slug}`;
    const title = p ? `${p.name} | متجر الاشتراكات الرقمية`.slice(0, 60) : "منتج | متجر الاشتراكات الرقمية";
    const desc = (p?.short_description || p?.description || "اشترِ هذا المنتج الرقمي بسعر تنافسي مع ضمان حقيقي وتسليم فوري.").slice(0, 160);
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "product" },
      { property: "og:url", content: url },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: desc },
    ];
    if (p?.main_image?.startsWith("https://")) {
      meta.push({ property: "og:image", content: p.main_image });
      meta.push({ name: "twitter:image", content: p.main_image });
    }
    const scripts = p
      ? [{
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.name,
            description: desc,
            image: p.main_image ? [p.main_image] : undefined,
            url,
            offers: {
              "@type": "Offer",
              price: Number(computeDiscountedPrice(p.base_price_egp, p.discount_percent ?? 0)).toFixed(2),
              priceCurrency: "EGP",
              availability: "https://schema.org/InStock",
              url,
            },
          }),
        }]
      : [];
    return { meta, links: [{ rel: "canonical", href: url }], scripts };
  },
});

function ProductPage() {
  const { slug } = Route.useParams();
  const { product: initialProduct } = Route.useLoaderData();
  const navigate = useNavigate();
  const { currency, rates } = useCurrency();
  const { add } = useCart();

  const productQ = useQuery({
    queryKey: ["product", slug],
    queryFn: async () => (await supabase.from("products").select("*, category:categories(id,slug,name,icon)").eq("slug", slug).eq("active", true).maybeSingle()).data,
    initialData: initialProduct,
    staleTime: 60_000,
  });
  const reviewsQ = useQuery({
    queryKey: ["reviews", productQ.data?.id],
    queryFn: async () => {
      if (!productQ.data?.id) return [];
      const { data } = await supabase.from("reviews").select("*").eq("product_id", productQ.data.id).eq("approved", true).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!productQ.data?.id,
  });
  const upsellQ = useQuery({
    queryKey: ["upsell", productQ.data?.id],
    queryFn: async () => {
      const ids = (productQ.data?.upsell_ids ?? []) as string[];
      if (!ids.length) return [];
      const { data } = await supabase.from("products").select("*, category:categories(icon,name)").in("id", ids).eq("active", true);
      return data ?? [];
    },
    enabled: !!productQ.data?.id,
  });

  if (productQ.isLoading) return <PageShell><div className="text-center py-20">جاري التحميل...</div></PageShell>;
  if (!productQ.data) return <PageShell><div className="text-center py-20"><h1 className="text-2xl font-bold">المنتج غير موجود</h1><Link to="/shop" className="text-primary mt-4 inline-block">العودة للمتجر</Link></div></PageShell>;

  const p = productQ.data as any;
  const rate = rates[currency.code] ?? 1;
  const priceEgp = computeDiscountedPrice(p.base_price_egp, p.discount_percent ?? 0);
  const localized = convertFromEgp(priceEgp, rate, currency.code);
  const original = convertFromEgp(p.base_price_egp, rate, currency.code);
  const hasDiscount = (p.discount_percent ?? 0) > 0;
  const avgRating = reviewsQ.data && reviewsQ.data.length ? reviewsQ.data.reduce((s: number, r: any) => s + r.rating, 0) / reviewsQ.data.length : 0;

  function handleAdd() {
    add({ productId: p.id, slug: p.slug, name: p.name, image: p.main_image, basePriceEgp: Number(p.base_price_egp), discountPercent: Number(p.discount_percent ?? 0), warrantyDays: p.warranty_days ?? 0 });
    toast.success("تمت الإضافة للسلة");
  }
  function handleBuyNow() {
    handleAdd();
    navigate({ to: "/checkout" });
  }

  return (
    <PageShell>
      <Link to="/shop" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 mb-6"><ArrowLeft className="size-4" />العودة للمتجر</Link>
      <div className="grid md:grid-cols-2 gap-8 animate-slide-up">
        <div className="card-surface rounded-lg overflow-hidden aspect-square relative">
          {p.main_image ? (
            <img src={p.main_image} alt={p.name} className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-9xl opacity-40">{p.category?.icon ?? "🎁"}</div>
          )}
          {hasDiscount && (
            <div className="absolute top-4 right-4 gradient-gold text-black text-sm font-bold px-4 py-1.5 rounded-full flex items-center gap-1">
              <Sparkles className="size-4" />خصم {p.discount_percent}%
            </div>
          )}
        </div>
        <div>
          {p.category && <span className="text-xs text-primary font-bold">{p.category.icon} {p.category.name}</span>}
          <h1 className="text-3xl md:text-4xl font-semibold mt-2">{p.name}</h1>
          {avgRating > 0 && (
            <div className="flex items-center gap-1 mt-2">
              {[1,2,3,4,5].map((n) => <Star key={n} className={`size-4 ${n <= Math.round(avgRating) ? "fill-yellow-400 text-yellow-400" : "text-muted"}`} />)}
              <span className="text-xs text-muted-foreground mr-2">({reviewsQ.data?.length ?? 0} تقييم)</span>
            </div>
          )}
          <p className="mt-4 text-muted-foreground leading-relaxed">{p.description}</p>

          <div className="mt-6 flex items-baseline gap-3">
            <span className="text-4xl font-semibold text-gradient">{formatPrice(localized, currency)}</span>
            {hasDiscount && <span className="text-lg text-muted-foreground line-through">{formatPrice(original, currency)}</span>}
          </div>

          {p.warranty_days > 0 && (
            <div className="mt-4 card-surface rounded-lg p-4 flex items-center gap-3">
              <ShieldCheck className="size-6 text-primary" />
              <div>
                <div className="font-bold">ضمان {p.warranty_days} يوم</div>
                <div className="text-xs text-muted-foreground">في حالة توقف الاشتراك يتم استبداله</div>
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-2">
            <Button onClick={handleBuyNow} size="lg" className="gradient-primary text-white glow-purple flex-1 h-12">اشترِ الآن</Button>
            <Button onClick={handleAdd} size="lg" variant="outline" className="border-primary/40 hover:bg-primary/10 h-12"><ShoppingCart className="size-5" /></Button>
          </div>
        </div>
      </div>

      {(upsellQ.data ?? []).length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold mb-6">قد يعجبك أيضاً</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {upsellQ.data!.map((up: any) => <ProductCard key={up.id} p={up} />)}
          </div>
        </section>
      )}

      {(reviewsQ.data ?? []).length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold mb-6">آراء العملاء</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {reviewsQ.data!.map((r: any) => (
              <div key={r.id} className="card-surface rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <div className="font-bold">{r.customer_name}</div>
                  <div className="flex">{[1,2,3,4,5].map((n) => <Star key={n} className={`size-3.5 ${n <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-muted"}`} />)}</div>
                </div>
                {r.comment && <p className="text-sm text-muted-foreground mt-2">{r.comment}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">{children}</main>
      <Footer />
      <WhatsAppFab />
    </div>
  );
}
