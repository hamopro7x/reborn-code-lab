import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { Countdown } from "@/components/site/Countdown";

import { ProductRail } from "@/components/site/ProductRail";
import { HeroCarousel } from "@/components/site/HeroCarousel";
import { normalizeBanner } from "@/lib/hero-banners";
import { TopupCard } from "@/components/site/TopupCard";
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
    staleTime: 5 * 60_000,
  });
  const latestQ = useQuery({
    queryKey: ["latest-products"],
    queryFn: async () => (await supabase.from("products").select("*, category:categories(icon,name)").eq("active", true).order("created_at", { ascending: false }).limit(10)).data ?? [],
    staleTime: 2 * 60_000,
  });
  const timerQ = useQuery({
    queryKey: ["timer"],
    queryFn: async () => (await supabase.from("countdown_timers").select("*").eq("active", true).gt("ends_at", new Date().toISOString()).order("ends_at").limit(1).maybeSingle()).data,
  });
  const ratesQ = useQuery({
    queryKey: ["rates"],
    queryFn: async () => (await supabase.from("exchange_rates").select("*")).data ?? [],
    staleTime: 10 * 60_000,
  });
  const currenciesQ = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => (await supabase.from("currencies").select("*").eq("active", true).order("sort_order")).data ?? [],
    staleTime: 10 * 60_000,
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

  const bannersQ = useQuery({
    queryKey: ["hero-banners"],
    queryFn: async () =>
      (await supabase.from("hero_banners").select("*").eq("active", true).order("sort_order")).data ?? [],
    staleTime: 2 * 60_000,
  });
  const banners = useMemo(() => (bannersQ.data ?? []).map((r: any) => normalizeBanner(r)), [bannersQ.data]);

  const desktopBanners = useMemo(() => banners.filter((b) => b.device !== "mobile"), [banners]);
  const mobileBanners = useMemo(() => {
    const only = banners.filter((b) => b.device === "mobile");
    return only.length ? only : desktopBanners;
  }, [banners, desktopBanners]);

  // بطاقات الشحن = منتجات الأقسام التي تمثل بطاقات/شحن في قاعدة البيانات نفسها.
  const topups = useMemo(() => {
    const all = latestQ.data ?? [];
    const isTopup = (p: any) => /card|top ?up|شحن|بطاق/i.test(`${p.category?.name ?? ""} ${p.name}`);
    const matched = all.filter(isTopup);
    return matched.length ? matched : [];
  }, [latestQ.data]);


  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {bannersQ.isLoading ? (
        <div className="min-h-[152px] h-auto md:h-[230px] bg-card animate-pulse" />
      ) : (
        <>
          <div className="md:hidden">
            <HeroCarousel banners={mobileBanners} />
          </div>
          <div className="hidden md:block">
            <HeroCarousel banners={desktopBanners} />
          </div>
        </>
      )}

      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="min-w-0 space-y-8">
          {(timerQ.isLoading || timerQ.data) && (
            <div className="flex justify-center">
              {timerQ.data && (
                <Countdown endsAt={timerQ.data.ends_at} title={timerQ.data.title} subtitle={timerQ.data.subtitle ?? undefined} />
              )}
            </div>
          )}


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

          {/* CATEGORIES */}
          <section aria-labelledby="categories-title" className="pt-1 pb-3 md:pt-2 md:pb-5">
            <h2 id="categories-title" className="mb-4 md:mb-5 text-base md:text-lg font-bold text-foreground">
              تصفح الأقسام
            </h2>

            <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory" aria-label="أقسام المتجر">
              <div className="flex w-max min-w-full gap-4 pb-3 md:gap-6">
              {categoriesQ.isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={`c-sk-${i}`} className="w-40 shrink-0 snap-start md:w-56">
                    <div className="category-art-frame aspect-[4/3] bg-category-surface animate-pulse" />
                    <div className="mt-4 h-5 w-3/4 bg-category-surface animate-pulse" />
                  </div>
                ))}
              {categories.map((c: any, ci: number) => (
                <Link
                  key={c.id}
                  to="/category/$slug"
                  params={{ slug: c.slug }}
                  className="group block w-40 shrink-0 snap-start text-foreground focus-visible:outline-none md:w-56"
                >
                  <div className="category-art-frame relative aspect-[4/3] overflow-hidden bg-category-surface">
                    {c.banner_image ? (
                      <img
                        src={c.banner_image}
                        alt={c.name}
                        width={448}
                        height={280}
                        loading={ci < 6 ? "eager" : "lazy"}
                        decoding="async"
                        {...(ci < 6 ? { fetchPriority: "high" as const } : {})}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted-foreground">
                        {c.name}
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-primary py-1.5 text-center text-[11px] font-bold text-primary-foreground md:text-xs">
                      تصفح العروض
                    </div>
                  </div>
                  <h3 className="category-title mt-3 line-clamp-2 min-h-12 px-1 text-center text-base font-bold leading-6 text-foreground transition-colors duration-150 group-hover:text-primary md:text-lg">
                    {c.name}
                  </h3>
                </Link>
              ))}

              </div>
            </div>
          </section>
        </div>
      </main>

      <Footer />
      <WhatsAppFab />
    </div>
  );
}
