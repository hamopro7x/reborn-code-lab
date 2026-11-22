import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useUiState, useScrollRestore } from "@/lib/ui-state";

import { listActiveProductsByCategorySlug } from "@/lib/products.queries";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { ProductCard } from "@/components/site/ProductCard";

export const Route = createFileRoute("/category/$slug")({
  component: CategoryPage,
  head: ({ params }) => {
    const title = `قسم ${params.slug} — متجر الاشتراكات الرقمية`;
    const description = "تصفح منتجات هذا القسم من الاشتراكات الرقمية والأدوات والقوالب مع أسعار محدثة وتسليم فوري.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: `https://mag-pro1.com/category/${params.slug}` }],
    };
  },
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const [q] = useUiState<string>(`category-${slug}`, "q", "");
  useScrollRestore(`category-${slug}`);

  const productsQ = useQuery({
    queryKey: ["products-category", slug],
    queryFn: async () =>
      listActiveProductsByCategorySlug(slug),
    staleTime: 60 * 1000,
  });

  const filtered = useMemo(() => {
    const list = productsQ.data ?? [];
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter(
      (p: any) => p.name.toLowerCase().includes(s) || p.description?.toLowerCase().includes(s),
    );
  }, [productsQ.data, q]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-2 md:px-4 py-8">

        {filtered.length === 0 ? (
          <div className="card-surface rounded-2xl p-16 text-center text-muted-foreground">
            لا توجد منتجات في هذا القسم حاليًا.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
            {filtered.map((p: any) => (
              <ProductCard key={p.id} p={p} compact />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
