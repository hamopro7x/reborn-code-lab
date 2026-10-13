import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";

export type LegalSection = { title: string; body?: string[]; items?: string[]; needsReview?: boolean };

export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <div dir="rtl" className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto w-full max-w-5xl flex-1 px-4 py-10 text-right md:py-16">
        <h1 className="mb-2 text-2xl font-bold md:text-3xl">{title}</h1>
        <p className="mb-6 text-sm text-muted-foreground">آخر تحديث: {updated}</p>
        <p className="mb-8 leading-8 text-muted-foreground">{intro}</p>
        <div className="grid gap-8 md:grid-cols-[230px_1fr]">
          <nav aria-label="المحتويات" className="h-fit rounded-xl border border-border bg-card p-4 md:sticky md:top-24">
            <p className="mb-3 text-sm font-bold">المحتويات</p>
            <ol className="space-y-2 text-sm">
              {sections.map((s, i) => (
                <li key={s.title}>
                  <a href={`#sec-${i}`} className="flex gap-2 text-muted-foreground hover:text-foreground">
                    <span className="font-bold text-primary">{i + 1}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="space-y-6">
            {sections.map((s, i) => (
              <section key={s.title} id={`sec-${i}`} aria-labelledby={`h-${i}`} className="scroll-mt-24 rounded-xl border border-border bg-card p-5">
                <h2 id={`h-${i}`} className="mb-3 text-lg font-bold md:text-xl">{s.title}</h2>
                {s.body?.map((p, j) => (
                  <p key={j} className="mb-2 leading-8 text-muted-foreground">{p}</p>
                ))}
                {s.items && (
                  <ul className="list-disc space-y-2 pr-5 leading-8 text-muted-foreground">
                    {s.items.map((p, j) => <li key={j}>{p}</li>)}
                  </ul>
                )}
              </section>
            ))}
            <div className="rounded-xl border border-primary/40 bg-card p-5">
              <p className="mb-1 font-bold">لديك سؤال حول هذه الصفحة؟</p>
              <p className="text-muted-foreground">فريق الدعم جاهز لمساعدتك عبر واتساب من خلال الروابط الموجودة أسفل الموقع.</p>
            </div>
          </div>
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
