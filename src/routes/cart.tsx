import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { useCart } from "@/lib/cart";
import { useCurrency } from "@/lib/currency-context";
import { convertFromEgp, formatPrice, computeDiscountedPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Minus, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/cart")({
  component: CartPage,
  head: () => ({
    meta: [
      { title: "سلة التسوق | متجر الاشتراكات الرقمية" },
      { name: "description", content: "راجع المنتجات الرقمية في سلتك، عدّل الكميات، وتابع لإتمام الشراء بأمان وبعملتك المحلية." },
      { property: "og:title", content: "سلة التسوق | متجر الاشتراكات الرقمية" },
      { property: "og:description", content: "راجع المنتجات الرقمية في سلتك، عدّل الكميات، وتابع لإتمام الشراء بأمان وبعملتك المحلية." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mag-pro1.com/cart" },
      { name: "twitter:title", content: "سلة التسوق | متجر الاشتراكات الرقمية" },
      { name: "twitter:description", content: "راجع المنتجات الرقمية في سلتك، عدّل الكميات، وتابع لإتمام الشراء بأمان وبعملتك المحلية." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function CartPage() {
  const { items, remove, updateQty, totalEgp, count } = useCart();
  const { currency, rates } = useCurrency();
  const navigate = useNavigate();
  const rate = rates[currency.code] ?? 1;
  const ids = items.map((i) => i.productId).sort();
  const detailsQ = useQuery({
    queryKey: ["cart-product-details", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, description, short_description, warranty_days, warranty_text, category:categories(name,icon)")
        .in("id", ids);
      const map: Record<string, any> = {};
      (data ?? []).forEach((p: any) => { map[p.id] = p; });
      return map;
    },
  });


  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        <h1 className="text-4xl font-black text-foreground mb-8">سلة التسوق</h1>
        {items.length === 0 ? (
          <div className="card-surface rounded-3xl p-16 text-center">
            <ShoppingBag className="size-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg mb-6">السلة فارغة</p>
            <Link to="/shop"><Button className="gradient-primary">تصفح المتجر</Button></Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-3">
              {items.map((i) => {
                const priceEgp = computeDiscountedPrice(i.basePriceEgp, i.discountPercent);
                const localized = convertFromEgp(priceEgp * i.quantity, rate, currency.code);
                const d = detailsQ.data?.[i.productId];
                return (
                  <div key={i.productId} className="card-surface rounded-2xl overflow-hidden">
                  <div className="p-4 flex items-center gap-4">
                    <div className="size-16 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                      {i.image ? <img src={i.image} alt={i.name} className="w-full h-full object-cover" /> : <span className="text-2xl">🎁</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{i.name}</div>
                      <div className="text-xs text-muted-foreground">ضمان {i.warrantyDays} يوم</div>
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => updateQty(i.productId, i.quantity - 1)} aria-label="تقليل الكمية" className="size-7 rounded-lg card-surface hover:bg-primary/10 flex items-center justify-center"><Minus className="size-3" /></button>
                        <span className="w-6 text-center text-sm font-bold">{i.quantity}</span>
                        <button onClick={() => updateQty(i.productId, i.quantity + 1)} aria-label="زيادة الكمية" className="size-7 rounded-lg card-surface hover:bg-primary/10 flex items-center justify-center"><Plus className="size-3" /></button>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gradient">{formatPrice(localized, currency)}</div>
                      <button onClick={() => remove(i.productId)} className="text-destructive text-xs mt-2 hover:underline flex items-center gap-1"><Trash2 className="size-3" />حذف</button>
                    </div>
                  </div>
                  <div className="border-t border-border/60 px-5 py-5 md:px-6 md:py-6" dir="rtl">
                    <h3 className="text-base md:text-lg font-black text-foreground mb-5">تفاصيل المنتج :-</h3>
                    {detailsQ.isLoading && !d ? (
                      <p className="text-sm text-muted-foreground">جاري تحميل التفاصيل...</p>
                    ) : !d ? (
                      <p className="text-sm text-muted-foreground">لا توجد تفاصيل إضافية.</p>
                    ) : (
                      <div className="space-y-6">
                        {d.category?.name && (
                          <section>
                            <div className="flex items-center gap-2 mb-2">
                              <Tag className="size-4 text-primary shrink-0" />
                              <h4 className="text-sm md:text-base font-black text-primary">التصنيف</h4>
                            </div>
                            <p className="text-sm md:text-[15px] text-foreground/90 leading-relaxed">{d.category.name}</p>
                          </section>
                        )}

                        {(d.short_description || d.description) && (
                          <section>
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="size-4 text-primary shrink-0" />
                              <h4 className="text-sm md:text-base font-black text-primary">الوصف</h4>
                            </div>
                            {d.short_description && (
                              <p className="text-sm md:text-[15px] text-muted-foreground leading-relaxed whitespace-pre-line break-words mb-2">{d.short_description}</p>
                            )}
                            {d.description && (
                              <p className="text-sm md:text-[15px] text-foreground/90 leading-[2] whitespace-pre-line break-words">{d.description}</p>
                            )}
                          </section>
                        )}

                        {(d.warranty_text?.trim() || d.warranty_days > 0) && (
                          <section>
                            <div className="flex items-center gap-2 mb-2">
                              <ShieldCheck className="size-4 text-primary shrink-0" />
                              <h4 className="text-sm md:text-base font-black text-primary">الضمان</h4>
                            </div>
                            <p className="text-sm md:text-[15px] text-foreground/90 leading-relaxed whitespace-pre-line break-words">{d.warranty_text?.trim() || `ضمان ${d.warranty_days} يوم`}</p>
                          </section>
                        )}
                      </div>
                    )}
                  </div>

                  </div>
                );
              })}
            </div>
            <div>
              <div className="card-surface rounded-2xl p-6 sticky top-24">
                <h2 className="font-bold text-lg mb-4">ملخص الطلب</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">عدد المنتجات</span><span>{count}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">الإجمالي</span><span className="font-black text-lg text-gradient">{formatPrice(convertFromEgp(totalEgp, rate, currency.code), currency)}</span></div>
                </div>
                <Button onClick={() => navigate({ to: "/checkout" })} className="gradient-primary w-full mt-6 h-11">إتمام الشراء</Button>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
      <WhatsAppFab />
    </div>
  );
}
