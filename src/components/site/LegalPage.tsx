import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";

export type LegalSection = { title: string; body: string[]; needsReview?: boolean };

export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <div dir="rtl" className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto w-full max-w-3xl flex-1 px-4 py-10 text-right md:py-16">
        <h1 className="mb-2 text-2xl font-bold md:text-3xl">{title}</h1>
        <p className="mb-6 text-sm text-muted-foreground">آخر تحديث: {updated}</p>
        <p className="mb-8 leading-8">{intro}</p>
        <div className="space-y-8">
          {sections.map((s, i) => (
            <section key={s.title} aria-labelledby={`sec-${i}`}>
              <h2 id={`sec-${i}`} className="mb-3 text-lg font-bold md:text-xl">
                {i + 1}. {s.title}
              </h2>
              {s.needsReview && (
                <p className="mb-2 rounded border border-border px-3 py-2 text-xs text-muted-foreground">
                  هذا البند قيد المراجعة من إدارة المتجر وقد يتم تحديثه.
                </p>
              )}
              {s.body.map((p, j) => (
                <p key={j} className="mb-2 leading-8 text-muted-foreground">{p}</p>
              ))}
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}

export function legalHead(path: string, title: string, description: string) {
  const url = `https://mag-pro1.com${path}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
