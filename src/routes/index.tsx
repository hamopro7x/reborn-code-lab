import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { ProductCard } from "@/components/site/ProductCard";
import { Countdown } from "@/components/site/Countdown";

import { ProductRail } from "@/components/site/ProductRail";
import { TopupCard } from "@/components/site/TopupCard";
import { HeroCarousel, type HeroSlide } from "@/components/site/HeroCarousel";
import { useEffect, useMemo } from "react";
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


function SectionHeading({ title, to }: { title: string; to?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 mb-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="h-6 w-1 shrink-0 rounded-full bg-primary" />
        <h2 className="truncate text-lg md:text-xl font-bold text-foreground">{title}</h2>
      </div>
      {to && (
        <Link
          to={to as any}
          className="shrink-0 rounded-lg bg-card text-card-foreground px-3 py-1.5 text-xs hover:bg-primary hover:text-primary-foreground transition-colors duration-150 inline-flex items-center gap-1.5"
        >
          عرض الكل
          <ArrowLeft className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

function Home() {
  const { setRates, setCurrencies } = useCurrency();

  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("*").eq("active", true).order("sort_order")).data ?? [],
  });
  const featuredQ = useQuery({
    queryKey: ["featured"],
    queryFn: async () => (await supabase.from("products").select("*, category:categories(icon,name)").eq("active", true).eq("featured", true).order("sort_order").limit(12)).data ?? [],
  });
  const latestQ = useQuery({
    queryKey: ["latest-products"],
    queryFn: async () => (await supabase.from("products").select("*, category:categories(icon,name)").eq("active", true).order("created_at", { ascending: false }).limit(10)).data ?? [],
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
  const heroQ = useQuery({
    queryKey: ["hero"],
    queryFn: async () => (await supabase.from("site_settings").select("value").eq("key", "hero").maybeSingle()).data?.value as any,
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

  const categories = categoriesQ.data ?? [];
  const featuredRaw = featuredQ.data ?? [];
  // لو مفيش منتجات مميزة نعرض الأحدث من نفس البيانات الموجودة.
  const featured = featuredRaw.length ? featuredRaw : (latestQ.data ?? []);

  // بانر ثابت يديره الأدمن (نص ثابت + صورة من الإعدادات) — غير مرتبط بالمنتجات.
  const heroBadges = useMemo(
    () => [{ title: "تسليم فوري", value: "بعد الدفع مباشرة" }],
    [],
  );

  // بطاقات الشحن = منتجات الأقسام التي تمثل بطاقات/شحن في قاعدة البيانات نفسها.
  const topups = useMemo(() => {
    const all = latestQ.data ?? [];
    const isTopup = (p: any) => /card|top ?up|شحن|بطاق/i.test(`${p.category?.name ?? ""} ${p.name}`);
    const matched = all.filter(isTopup);
    return matched.length ? matched : [];
  }, [latestQ.data]);

  const slides: HeroSlide[] = useMemo(() => {
    const h = (heroQ.data ?? {}) as any;
    return [{
      id: "hero",
      title: h.title || "أفضل المنتجات الرقمية بأسعار مميزة",
      subtitle: h.subtitle || "اشتراكات وأدوات وقوالب جاهزة للاستخدام مع ضمان حقيقي وتسليم فوري.",
      image: h.image || null,
      to: "/shop",
    }];
  }, [heroQ.data]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Banner full-width, flush under header */}
      <div>
        <HeroCarousel slides={slides} badges={heroBadges} />
      </div>

      <main className="flex-1 container mx-auto px-4 py-6">
        {/* Mobile / tablet categories strip */}
        <nav aria-label="الأقسام" className="lg:hidden -mx-4 px-4 mb-4 overflow-x-auto scrollbar-hide">
          <ul className="flex items-center gap-2 w-max">
            {categories.map((c: any) => (
              <li key={c.id}>
                <Link
                  to="/shop"
                  search={{ category: c.slug } as any}
                  className="block whitespace-nowrap rounded-lg bg-panel text-panel-foreground px-3 py-2 text-xs font-bold hover:bg-card hover:text-card-foreground transition-colors duration-150"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-8">

          {(timerQ.isLoading || timerQ.data) && (
            <div className="flex justify-center">
              {timerQ.data && (
                <Countdown endsAt={timerQ.data.ends_at} title={timerQ.data.title} subtitle={timerQ.data.subtitle ?? undefined} />
              )}
            </div>
          )}


          {/* PRODUCTS */}
          <section>
            <SectionHeading title="أحدث المنتجات" to="/shop" />
            {(featuredQ.isLoading || latestQ.isLoading) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={`p-sk-${i}`} className="rounded-xl border border-border bg-card h-[16rem] animate-pulse" />
                ))}
              </div>
            )}
            {featured.length > 0 && (
              <ProductRail ariaLabel="أحدث المنتجات">
                {featured.map((p: any) => (
                  <ProductCard key={p.id} p={p} />
                ))}
              </ProductRail>
            )}
            {!featuredQ.isLoading && !latestQ.isLoading && featured.length === 0 && (
              <p className="text-sm text-muted-foreground">لا توجد منتجات متاحة حاليًا.</p>
            )}
          </section>

          {/* TOP-UP CARDS */}
          {topups.length > 0 && (
            <section>
              <SectionHeading title="بطاقات الشحن" to="/shop" />
              <ProductRail
                ariaLabel="بطاقات الشحن"
                itemClassName="w-[72%] sm:w-[46%] md:w-[32%] xl:w-[24%]"
              >
                {topups.map((p: any) => (
                  <TopupCard key={p.id} p={p} />
                ))}
              </ProductRail>
            </section>
          )}

          {/* CATEGORIES / CARDS SECTION */}
          <section>
            <SectionHeading title="تصفح الأقسام" to="/shop" />
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
              {categoriesQ.isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={`c-sk-${i}`} className="rounded-xl border border-border bg-card h-[10rem] animate-pulse" />
                ))}
              {categories.map((c: any) => (
                <Link
                  key={c.id}
                  to="/shop"
                  search={{ category: c.slug } as any}
                  className="group rounded-xl border border-border bg-card text-card-foreground overflow-hidden flex flex-col transition-colors duration-150 hover:border-primary"
                >
                  <div className="aspect-[4/3] bg-muted overflow-hidden">
                    {c.banner_image ? (
                      <img
                        src={c.banner_image}
                        alt={c.name}
                        width={400}
                        height={300}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground px-2 text-center">
                        {c.name}
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-2.5 text-sm font-bold text-center truncate border-t border-border">
                    {c.name}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>

      <Footer />
      <WhatsAppFab />
    </div>
  );
}
