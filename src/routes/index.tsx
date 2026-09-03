import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Heart, ShoppingCart } from "lucide-react";
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
import { useFavorites } from "@/lib/favorites";
import { toast } from "sonner";

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
  const { isFavorite, toggle } = useFavorites();

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

      <main className="flex-1 container mx-auto px-4 py-6">
        {/* Mobile / tablet categories strip */}
        <nav aria-label="الأقسام" className="lg:hidden -mx-4 px-4 mb-4 overflow-x-auto scrollbar-hide">
          <ul className="flex items-center gap-1.5 w-max">
            {categories.map((c: any) => (
              <li key={c.id}>
                <Link
                  to="/category/$slug"
                  params={{ slug: c.slug }}
                  className="block whitespace-nowrap rounded-lg bg-panel text-panel-foreground px-2.5 py-1.5 text-xs font-bold hover:bg-card hover:text-card-foreground transition-colors duration-150"
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
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-2">
              {categoriesQ.isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={`c-sk-${i}`} className="rounded-xl border border-border bg-card h-[10rem] animate-pulse" />
                ))}
              {categories.map((c: any, ci: number) => (
                <Link
                  key={c.id}
                  to="/category/$slug"
                  params={{ slug: c.slug }}
                  className="group rounded-xl border border-border bg-card text-card-foreground overflow-hidden flex flex-col transition-colors duration-150 hover:border-primary"
                >
                  <div className="aspect-[4/3] bg-muted overflow-hidden">
                    {c.banner_image ? (
                      <img
                        src={c.banner_image}
                        alt={c.name}
                        width={400}
                        height={300}
                        loading={ci < 6 ? "eager" : "lazy"}
                        decoding="async"
                        {...(ci < 6 ? { fetchPriority: "high" as const } : {})}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground px-2 text-center">
                        {c.name}
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-2.5 flex items-center justify-between gap-2 border-t border-border">
                    <span className="text-sm font-bold text-right truncate min-w-0">{c.name}</span>
                    <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                      <button
                        type="button"
                        aria-label={isFavorite(c.id) ? "إزالة من المفضلة" : "إضافة للمفضلة"}
                        aria-pressed={isFavorite(c.id)}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const on = toggle(c.id);
                          toast.success(on ? "تمت الإضافة للمفضلة" : "تمت الإزالة من المفضلة");
                        }}
                        className="transition-colors hover:text-primary"
                      >
                        <Heart className={`size-3.5 ${isFavorite(c.id) ? "fill-primary text-primary" : ""}`} />
                      </button>
                      <ShoppingCart className="size-3.5" />
                    </div>
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
