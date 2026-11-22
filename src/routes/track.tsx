import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export const Route = createFileRoute("/track")({
  component: TrackPage,
  head: () => ({
    meta: [
      { title: "تتبع طلبك | متجر الاشتراكات الرقمية" },
      { name: "description", content: "أدخل كود الطلب لمتابعة حالة طلبك الرقمي لحظة بلحظة." },
      { property: "og:title", content: "تتبع طلبك | متجر الاشتراكات الرقمية" },
      { property: "og:description", content: "أدخل كود الطلب لمتابعة حالة طلبك الرقمي لحظة بلحظة، أو استعرض طلباتك السابقة على هذا الجهاز." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://mag-pro1.com/track" },
      { name: "twitter:title", content: "تتبع طلبك | متجر الاشتراكات الرقمية" },
      { name: "twitter:description", content: "أدخل كود الطلب لمتابعة حالة طلبك الرقمي لحظة بلحظة، أو استعرض طلباتك السابقة على هذا الجهاز." },
    ],
    links: [{ rel: "canonical", href: "https://mag-pro1.com/track" }],
  }),
});

function TrackPage() {
  const [code, setCode] = useState("");
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-16 max-w-lg space-y-8">
        <div className="card-surface rounded-3xl p-8 animate-slide-up text-center">
          <div className="size-16 rounded-full gradient-primary mx-auto flex items-center justify-center mb-4">
            <Search className="size-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-black text-gradient mb-2">تتبع طلبك</h1>
          <p className="text-sm text-muted-foreground mb-6">أدخل كود الطلب لعرض حالته</p>
          <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) navigate({ to: "/order/$code", params: { code: code.trim() } }); }}>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ORD-XXXXXXXX" className="h-12 font-mono text-center text-lg mb-4" />
            <Button type="submit" className="w-full h-12 gradient-primary">تتبع</Button>
          </form>
        </div>

      </main>
      <Footer />
    </div>
  );
}
