import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listOrdersByDevice } from "@/lib/orders.functions";
import { getCachedFingerprint } from "@/lib/device-session";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Package } from "lucide-react";

export const Route = createFileRoute("/track")({
  component: TrackPage,
  head: () => ({
    meta: [
      { title: "تتبع طلبك | متجر الاشتراكات الرقمية" },
      { name: "description", content: "أدخل كود الطلب لمتابعة حالة طلبك الرقمي لحظة بلحظة، أو استعرض طلباتك السابقة على هذا الجهاز." },
      { property: "og:title", content: "تتبع طلبك | متجر الاشتراكات الرقمية" },
      { property: "og:description", content: "أدخل كود الطلب لمتابعة حالة طلبك الرقمي لحظة بلحظة، أو استعرض طلباتك السابقة على هذا الجهاز." },
      { property: "og:type", content: "website" },
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
  const [fp, setFp] = useState<string | null>(null);
  const listFn = useServerFn(listOrdersByDevice);
  useEffect(() => { getCachedFingerprint().then(setFp).catch(() => {}); }, []);
  const myOrders = useQuery({
    queryKey: ["device-orders", fp],
    queryFn: async () => (fp ? await listFn({ data: { device_id: fp } }) : []),
    enabled: !!fp,
  });
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

        {myOrders.data && myOrders.data.length > 0 && (
          <div className="card-surface rounded-3xl p-6 animate-slide-up">
            <div className="flex items-center gap-2 mb-4">
              <Package className="size-5 text-primary" />
              <h2 className="text-lg font-bold">طلباتي على هذا الجهاز</h2>
            </div>
            <div className="space-y-2">
              {myOrders.data.map((o: any) => (
                <button
                  key={o.id}
                  onClick={() => navigate({ to: "/order/$code", params: { code: o.order_code } })}
                  className="w-full text-right p-3 rounded-xl bg-muted/40 hover:bg-muted transition-colors flex items-center justify-between gap-3"
                >
                  <div className="text-xs">
                    <div className="font-mono font-bold">{o.order_code}</div>
                    <div className="text-muted-foreground mt-0.5">{new Date(o.created_at).toLocaleString("ar-EG")}</div>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold">{o.total} {o.currency_code}</div>
                    <div className="text-[10px] text-muted-foreground">{o.status}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
      <Footer />
      <WhatsAppFab />
    </div>
  );
}
