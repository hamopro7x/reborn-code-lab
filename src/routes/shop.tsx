import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useUiState, useScrollRestore } from "@/lib/ui-state";

import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { ProductCard } from "@/components/site/ProductCard";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export const Route = createFileRoute("/shop")({
  component: Shop,
  validateSearch: (s: Record<string, unknown>): { category?: string; q?: string } => ({
    ...(typeof s.category === "string" ? { category: s.category } : {}),
    ...(typeof s.q === "string" ? { q: s.q } : {}),
  }),
  head: () => ({
    meta: [
      { title: "المتجر — كل المنتجات الرقمية | متجر الاشتراكات" },
      { name: "description", content: "تصفح كل الاشتراكات الرقمية وأدوات الذكاء الاصطناعي وقوالب التصميم مرتبة حسب الفئة مع البحث والأسعار بعملتك." },
      { property: "og:title", content: "المتجر — كل المنتجات الرقمية | متجر الاشتراكات" },
      { property: "og:description", content: "تصفح كل الاشتراكات الرقمية وأدوات الذكاء الاصطناعي وقوالب التصميم مرتبة حسب الفئة مع البحث والأسعار بعملتك." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mag-pro1.com/shop" },
      { name: "twitter:title", content: "المتجر — كل المنتجات الرقمية | متجر الاشتراكات" },
      { name: "twitter:description", content: "تصفح كل الاشتراكات الرقمية وأدوات الذكاء الاصطناعي وقوالب التصميم مرتبة حسب الفئة مع البحث والأسعار بعملتك." },
    ],
    links: [{ rel: "canonical", href: "https://mag-pro1.com/shop" }],
  }),

});

function Shop() {
  const { category, q: qParam } = Route.useSearch();
  // البحث والتصنيف يبقيان كما هما بعد تحديث الصفحة.
  const [q, setQ] = useUiState<string>("shop", "q", qParam ?? "");
  const activeCat = category;
  useScrollRestore("shop");


  const productsQ = useQuery({
    queryKey: ["products-all"],
    queryFn: async () => (await supabase.from("products").select("*, category:categories(id,slug,name,icon)").eq("active", true).order("sort_order")).data ?? [],
  });

  const filtered = useMemo(() => {
    let list = productsQ.data ?? [];
    if (activeCat) list = list.filter((p: any) => p.category?.slug === activeCat);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((p: any) => p.name.toLowerCase().includes(s) || p.description?.toLowerCase().includes(s));
    }
    return list;
  }, [productsQ.data, activeCat, q]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-6 flex gap-3 flex-col md:flex-row">
          <div className="relative w-full md:w-1/4">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن منتج..." className="pr-9 h-10 text-sm bg-card/60" />
          </div>
        </div>


        {filtered.length === 0 ? (
          <div className="card-surface rounded-2xl p-16 text-center text-muted-foreground">
            لا توجد منتجات مطابقة.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((p: any) => <ProductCard key={p.id} p={p} />)}
          </div>
        )}
      </main>
      <Footer />
      <WhatsAppFab />
    </div>
  );
}
