import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrderByCode } from "@/lib/orders.functions";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/order/$code")({
  component: OrderPage,
  head: () => ({
    meta: [
      { title: "تفاصيل الطلب | متجر الاشتراكات الرقمية" },
      { name: "description", content: "صفحة متابعة تفاصيل طلبك وحالة التسليم وبيانات الاشتراك الخاصة بك." },
      { property: "og:title", content: "تفاصيل الطلب | متجر الاشتراكات الرقمية" },
      { property: "og:description", content: "صفحة متابعة تفاصيل طلبك وحالة التسليم وبيانات الاشتراك الخاصة بك." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mag-pro1.com/order" },
      { name: "twitter:title", content: "تفاصيل الطلب | متجر الاشتراكات الرقمية" },
      { name: "twitter:description", content: "صفحة متابعة تفاصيل طلبك وحالة التسليم وبيانات الاشتراك الخاصة بك." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function OrderPage() {
  const { code } = Route.useParams();
  const getOrderFn = useServerFn(getOrderByCode);
  const orderQ = useQuery({
    queryKey: ["order", code],
    queryFn: async () => await getOrderFn({ data: { order_code: code } }),
    refetchInterval: 8000,
  });
  const [invoiceSent, setInvoiceSent] = useState(false);
  useEffect(() => {
    try { setInvoiceSent(localStorage.getItem(`invoice_sent_${code}`) === "1"); } catch {}
  }, [code]);
  function markInvoiceSent() {
    try { localStorage.setItem(`invoice_sent_${code}`, "1"); } catch {}
    setInvoiceSent(true);
  }

  const o = orderQ.data as any;
  const statusLabels: Record<string, { label: string; color: string }> = {
    pending_payment: { label: "بانتظار الدفع", color: "text-yellow-400" },
    awaiting_confirmation: { label: "قيد المراجعة", color: "text-blue-400" },
    confirmed: { label: "تم التأكيد ✓", color: "text-green-400" },
    completed: { label: "مكتمل ✓", color: "text-green-400" },
    rejected: { label: "مرفوض", color: "text-red-400" },
    cancelled: { label: "ملغى", color: "text-red-400" },
  };

  function waMessage() {
    if (!o) return "";
    const itemsText = (o.items ?? [])
      .map((i: any) => `• ${i.product_name} × ${i.quantity}`)
      .join("\n");
    const lines = [
      "🧾 فاتورة الطلب",
      "",
      `كود الطلب : ${o.order_code}`,
      `اسم المنتج :`,
      itemsText,
      "",
      `اجمالي المبلغ المدفوع : ${o.total} ${o.currency_code}`,
    ];
    return encodeURIComponent(lines.join("\n"));
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        {!o ? <div className="text-center py-16">جاري التحميل...</div> : (
          <div className="animate-slide-up">
            <div className="text-center mb-8">
              <div className="size-16 rounded-full gradient-primary mx-auto flex items-center justify-center mb-4 glow-purple">
                <CheckCircle2 className="size-8 text-white" />
              </div>
              <h1 className="text-3xl font-black text-gradient">تم إرسال طلبك</h1>
              <p className="text-muted-foreground mt-2">سيتم مراجعة الدفع وتأكيد الطلب قريباً</p>
            </div>

            <div className="card-surface rounded-2xl p-6 mb-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-muted-foreground">حالة الطلب :</div>
                  <div className={`font-bold ${statusLabels[o.status]?.color ?? ""}`}>{statusLabels[o.status]?.label ?? o.status}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-muted-foreground">كود الطلب انسخو لتتبع طلبك :</div>
                  <div className="flex items-center gap-2">
                    <div className="font-mono font-black text-lg text-gradient">{o.order_code}</div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(o.order_code); toast.success("تم النسخ"); }}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary/10 hover:bg-primary/20 px-2 py-1 text-xs font-medium text-primary transition-colors"
                    >
                      <Copy className="size-3.5" />
                      نسخ
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-muted-foreground">الاسم :</div>
                  <div className="font-bold">{o.customer_name}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-muted-foreground">اجمالي المبلغ :</div>
                  <div className="font-black">{o.total} {o.currency_code}</div>
                </div>
              </div>

              <div className="border-t border-border mt-4 pt-4">
                <div className="text-xs text-muted-foreground mb-2">المنتجات</div>
                {(o.items ?? []).map((i: any) => (
                  <div key={i.id} className="flex justify-between text-sm py-1">
                    <span>{i.product_name} × {i.quantity}</span>
                    <span className="text-muted-foreground">{i.unit_price} {o.currency_code}</span>
                  </div>
                ))}
              </div>
            </div>

            {!invoiceSent && (
              <a href={`https://wa.me/201120373986?text=${waMessage()}`} target="_blank" rel="noreferrer" onClick={markInvoiceSent}>
                <Button className="w-full h-10 bg-black hover:bg-black/90 text-white gap-2 text-sm font-bold">
                  <MessageCircle className="size-4" />
                  اضغط هنا لإرسال الفاتورة عبر الواتساب
                </Button>
              </a>
            )}

            <div className="text-center mt-6">
              <Link to="/shop" className="text-primary text-sm">متابعة التسوق</Link>
            </div>
          </div>
        )}
      </main>
      <Footer />
      <WhatsAppFab />
    </div>
  );
}
