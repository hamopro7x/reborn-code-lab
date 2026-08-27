import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag, Search, Sparkles, Shield, Zap, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { ProductCard } from "@/components/site/ProductCard";
import { Countdown } from "@/components/site/Countdown";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useCurrency } from "@/lib/currency-context";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "متجر الاشتراكات الرقمية | اشتراكات وأدوات AI" },
      { name: "description", content: "اشترِ اشتراكات رقمية، أدوات ذكاء اصطناعي، وقوالب كانفا بأسعار تنافسية مع ضمان حقيقي وتسليم فوري." },
      { property: "og:title", content: "متجر الاشتراكات الرقمية | اشتراكات وأدوات AI" },
      { property: "og:description", content: "اشترِ اشتراكات رقمية، أدوات ذكاء اصطناعي، وقوالب كانفا بأسعار تنافسية مع ضمان حقيقي وتسليم فوري." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mag-pro1.com/" },
      { name: "twitter:title", content: "متجر الاشتراكات الرقمية | اشتراكات وأدوات AI" },
      { name: "twitter:description", content: "اشترِ اشتراكات رقمية، أدوات ذكاء اصطناعي، وقوالب كانفا بأسعار تنافسية مع ضمان حقيقي وتسليم فوري." },
    ],
    links: [{ rel: "canonical", href: "https://mag-pro1.com/" }],
  }),
});

function Home() {
  const { setRates, setCurrencies } = useCurrency();

  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("*").eq("active", true).order("sort_order")).data ?? [],
  });
  const featuredQ = useQuery({
    queryKey: ["featured"],
    queryFn: async () => (await supabase.from("products").select("*, category:categories(icon,name)").eq("active", true).eq("featured", true).order("sort_order").limit(8)).data ?? [],
  });
  const timerQ = useQuery({
    queryKey: ["timer"],
    queryFn: async () => (await supabase.from("countdown_timers").select("*").eq("active", true).gt("ends_at", new Date().toISOString()).order("ends_at").limit(1).maybeSingle()).data,
  });
  const ratesQ = useQuery({
    queryKey: ["rates"],
    queryFn: async () => (await supabase.from("exchange_rates").select("*")).data ?? [],
  });
  const currenciesQ = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => (await supabase.from("currencies").select("*").eq("active", true).order("sort_order")).data ?? [],
  });

  useEffect(() => {
    if (ratesQ.data) {
      const map: Record<string, number> = {};
      ratesQ.data.forEach((r: any) => { map[r.currency_code] = Number(r.rate_from_egp); });
      setRates(map);
    }
  }, [ratesQ.data]);
  useEffect(() => {
    if (currenciesQ.data && currenciesQ.data.length) setCurrencies(currenciesQ.data as any);
  }, [currenciesQ.data]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* HERO */}
        <section className="border-b border-border">
          <div className="container mx-auto px-4 py-16 md:py-20">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold leading-tight md:text-5xl">
                متجر الاشتراكات الرقمية
              </h1>
              <p className="mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
                اشتراكات، أدوات ذكاء اصطناعي، منتجات تصميم، وقوالب كانفا جاهزة للاستخدام،
                بأسعار مناسبة لبلدك.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/shop">
                  <Button size="lg" className="h-10 gap-2 px-6 text-sm font-medium">
                    <ShoppingBag className="size-4" />
                    تسوق الآن
                  </Button>
                </Link>
                <Link to="/track">
                  <Button size="lg" variant="outline" className="h-10 gap-2 px-6 text-sm font-medium">
                    <Search className="size-4" />
                    تتبع طلبك
                  </Button>
                </Link>
              </div>

              <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4 border-t border-border pt-6">
                {[
                  { label: "التسليم", value: "فوري" },
                  { label: "الضمان", value: "حقيقي" },
                  { label: "الأسعار", value: "بعملة بلدك" },
                ].map((f) => (
                  <div key={f.label}>
                    <dt className="text-xs text-muted-foreground">{f.label}</dt>
                    <dd className="mt-1 text-sm font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* COUNTDOWN */}
        {(timerQ.isLoading || timerQ.data) && (
          <section className="container mx-auto flex min-h-[8rem] justify-center px-4 py-8">
            {timerQ.data && (
              <Countdown endsAt={timerQ.data.ends_at} title={timerQ.data.title} subtitle={timerQ.data.subtitle ?? undefined} />
            )}
          </section>
        )}

        {/* CATEGORIES */}
        <section className="container mx-auto px-4 py-12">
          <div className="mb-6 flex items-end justify-between border-b border-border pb-4">
            <div>
              <h2 className="text-xl font-semibold">الأقسام</h2>
              <p className="mt-1 text-sm text-muted-foreground">تصفح جميع الأقسام</p>
            </div>
            <Link to="/shop" className="flex items-center gap-1.5 text-sm text-primary">
              كل المنتجات <ArrowLeft className="size-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {categoriesQ.isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={`cat-skeleton-${i}`} className="h-[14rem] rounded-lg border border-border bg-card" />
              ))}
            {(categoriesQ.data ?? []).map((c: any) => (
              <Link
                key={c.id}
                to="/shop"
                search={{ category: c.slug } as any}
                className="flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/25"
              >
                <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-secondary">
                  {c.banner_image ? (
                    <img
                      src={c.banner_image}
                      alt={c.name}
                      width={480}
                      height={480}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">لا توجد صورة</span>
                  )}
                </div>
                <div className="shrink-0 border-t border-border px-3 py-2.5 text-center text-sm font-medium line-clamp-1">
                  {c.name}
                </div>
              </Link>
            ))}
          </div>

        </section>


      </main>
      <Footer />
      <WhatsAppFab />
    </div>
  );
}
