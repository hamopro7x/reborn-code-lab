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
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-20 right-10 size-72 rounded-full bg-primary/30 blur-3xl animate-floaty" />
            <div className="absolute bottom-10 left-20 size-96 rounded-full bg-accent/20 blur-3xl animate-floaty" style={{ animationDelay: "2s" }} />
          </div>
          <div className="container mx-auto px-4 py-20 md:py-28 relative">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full card-surface text-xs mb-6">
                <Sparkles className="size-3 text-primary" />
                منصة رقمية احترافية · ضمان حقيقي · تسليم فوري
              </div>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-black leading-tight">
                <span className="text-gradient">متجر الاشتراكات الرقمية</span>
              </h1>
              <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
                اشتراكات، أدوات ذكاء اصطناعي، منتجات تصميم، وقوالب كانفا احترافية — جاهزة للاستخدام، بأسعار مناسبة لبلدك.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link to="/shop">
                  <Button size="lg" className="gradient-primary text-white glow-purple gap-2 h-12 px-8 text-base font-bold">
                    <ShoppingBag className="size-5" />
                    تسوق الآن
                  </Button>
                </Link>
                <Link to="/track">
                  <Button size="lg" variant="outline" className="gap-2 h-12 px-8 text-base border-primary/40 hover:bg-primary/10">
                    <Search className="size-5" />
                    تتبع طلبك
                  </Button>
                </Link>
              </div>

              <div className="mt-12 grid grid-cols-3 max-w-2xl mx-auto gap-3">
                {[
                  { icon: Zap, label: "تسليم فوري" },
                  { icon: Shield, label: "ضمان حقيقي" },
                  { icon: Sparkles, label: "أسعار تنافسية" },
                ].map((f) => (
                  <div key={f.label} className="card-surface rounded-xl p-3 text-center">
                    <f.icon className="size-5 mx-auto text-primary mb-1" />
                    <div className="text-xs">{f.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* COUNTDOWN */}
        {(timerQ.isLoading || timerQ.data) && (
          <section className="container mx-auto px-4 -mt-12 pt-1 pb-2 flex justify-center min-h-[9rem]">
            {timerQ.data && (
              <Countdown endsAt={timerQ.data.ends_at} title={timerQ.data.title} subtitle={timerQ.data.subtitle ?? undefined} />
            )}
          </section>
        )}

        {/* CATEGORIES */}
        <section className="container mx-auto px-4 py-12">
          <div className="flex items-end justify-between mb-8">
            <div className="flex items-center gap-3">
              <span className="h-8 w-1.5 rounded-full bg-primary" />
              <div>
                <h2 className="text-3xl font-black">الأقسام</h2>
                <p className="text-muted-foreground text-sm mt-1">تصفح جميع الأقسام</p>
              </div>
            </div>
            <Link to="/shop" className="text-primary text-sm flex items-center gap-1 hover:gap-2 transition-all">
              كل المنتجات <ArrowLeft className="size-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {categoriesQ.isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={`cat-skeleton-${i}`} className="card-surface rounded-2xl p-4 h-[10.5rem] animate-pulse" />
              ))}
            {(categoriesQ.data ?? []).map((c: any, i: number) => (
              <Link
                key={c.id}
                to="/shop"
                search={{ category: c.slug } as any}
                className="group relative rounded-2xl p-[1px] bg-gradient-to-br from-white/10 via-transparent to-transparent hover:from-primary/60 hover:to-primary/10 transition-all duration-300 animate-slide-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="relative overflow-hidden card-surface rounded-[15px] h-[10.5rem] flex flex-col transition-transform duration-300 group-hover:-translate-y-1">
                  <div className="relative flex-1 overflow-hidden bg-muted/20 flex items-center justify-center">
                    {c.banner_image ? (
                      <img
                        src={c.banner_image}
                        alt={c.name}
                        width={480}
                        height={320}
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="text-6xl transition-transform duration-500 group-hover:scale-110">{c.icon ?? "🎁"}</div>
                    )}
                  </div>
                  <div className="relative shrink-0 border-t border-border/50 bg-card/80 px-3 py-2.5 font-bold text-sm text-center line-clamp-1 w-full group-hover:text-primary transition-colors">
                    {c.name}
                  </div>
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
