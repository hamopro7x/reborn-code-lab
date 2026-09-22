import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { useCart, type CartItem } from "@/lib/cart";
import { useCurrency } from "@/lib/currency-context";
import { convertFromEgp, formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/cart")({
  component: CartPage,
  head: () => ({
    meta: [
      { title: "سلة التسوق | متجر الاشتراكات الرقمية" },
      { name: "description", content: "راجع المنتجات الرقمية في سلتك، عدّل الكميات، وتابع لإتمام الشراء بأمان وبعملتك المحلية." },
      { property: "og:title", content: "سلة التسوق | متجر الاشتراكات الرقمية" },
      { property: "og:description", content: "راجع المنتجات الرقمية في سلتك، عدّل الكميات، وتابع لإتمام الشراء بأمان وبعملتك المحلية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type ProductDetails = {
  description?: string | null;
  short_description?: string | null;
  warranty_days?: number | null;
  warranty_text?: string | null;
  refund_text?: string | null;
};

function CartProductCard({
  item,
  details,
  active,
  position,
  onSelect,
  onQuantity,
  formatAmount,
}: {
  item: CartItem;
  details?: ProductDetails;
  active: boolean;
  position: "left" | "right" | "hidden";
  onSelect: () => void;
  onQuantity: (quantity: number) => void;
  formatAmount: (amount: number) => string;
}) {
  const original = item.basePriceEgp * item.quantity;
  const total = original * (1 - item.discountPercent / 100);
  const discount = Math.max(0, original - total);
  const features = String(details?.description ?? "")
    .split("\n")
    .map((line) => line.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean);

  return (
    <article
      className={`cart-v4-product ${active ? "is-active" : `is-${position}`}`}
      aria-hidden={!active}
      onClick={!active && position !== "hidden" ? onSelect : undefined}
    >
      <div className="cart-v4-product-head">
        <div className="cart-v4-image">
          {item.image ? <img src={item.image} alt={item.name} /> : <ShoppingBag aria-hidden="true" />}
        </div>
        <div className="cart-v4-product-info">
          <h2>{item.name}</h2>
          <div className="cart-v4-quantity">
            <span>عدد الحسابات</span>
            <div className="cart-v4-quantity-controls" dir="ltr">
              <span className="cart-v4-count">{item.quantity}</span>
              <span className="cart-v4-equals">=</span>
              <Button type="button" variant="ghost" size="icon" onClick={() => onQuantity(item.quantity + 1)} aria-label="زيادة الكمية">
                <Plus aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => onQuantity(item.quantity - 1)} aria-label="تقليل الكمية">
                <Minus aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="cart-v4-details">
        <h3>تفاصيل المنتج</h3>
        {details?.short_description && <p>{details.short_description}</p>}
        {features.length > 0 && (
          <ul>
            {features.map((feature, index) => <li key={`${feature}-${index}`}>{feature}</li>)}
          </ul>
        )}
        {(details?.warranty_text?.trim() || Number(details?.warranty_days) > 0) && (
          <p><strong>الضمان:</strong> {details?.warranty_text?.trim() || `${details?.warranty_days} يوم`}</p>
        )}
        {details?.refund_text?.trim() && <p><strong>الاسترداد:</strong> {details.refund_text}</p>}
      </div>

      <div className="cart-v4-price-lines">
        <div><span>السعر الأصلي</span><b>{formatAmount(original)}</b></div>
        <div className="is-discount"><span>الخصم</span><b>− {formatAmount(discount)}</b></div>
        <div className="is-total"><span>سعر المنتج بعد الخصم</span><b>{formatAmount(total)}</b></div>
      </div>
    </article>
  );
}

function CartPage() {
  const { items, updateQty, totalEgp, count } = useCart();
  const { currency, rates } = useCurrency();
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
  const rate = rates[currency.code] ?? 1;
  const ids = items.map((item) => item.productId).sort();
  const detailsQ = useQuery({
    queryKey: ["cart-product-details", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, description, short_description, warranty_days, warranty_text, refund_text")
        .in("id", ids);
      return Object.fromEntries((data ?? []).map((product: any) => [product.id, product])) as Record<string, ProductDetails>;
    },
  });

  const safeIndex = items.length > 0 ? Math.min(activeIndex, items.length - 1) : 0;
  const move = (direction: number) => setActiveIndex((current) => (current + direction + items.length) % items.length);
  const formatAmount = (amount: number) => formatPrice(convertFromEgp(amount, rate, currency.code), currency);

  return (
    <div className="cart-v4" dir="rtl">
      <main className="cart-v4-shell">
        <header className="cart-v4-appbar">
          <Link to="/" className="cart-v4-brand" aria-label="العودة إلى الرئيسية">
            <img src="/favicon.png" alt="شعار MG Pro" />
            <span><strong>MG Pro</strong><small>الاشتراكات الرقمية</small></span>
          </Link>
          <ShoppingBag aria-hidden="true" />
        </header>

        <div className="cart-v4-title">
          <h1>سلة التسوق</h1>
          <span>
            {items.length} {items.length === 1 ? "منتج" : "منتجات"} · {count} {count === 1 ? "حساب" : "حسابات"}
          </span>
        </div>

        {items.length === 0 ? (
          <section className="cart-v4-empty">
            <ShoppingBag aria-hidden="true" />
            <p>السلة فارغة</p>
            <Link to="/shop"><Button className="cart-v4-checkout">تصفح المتجر</Button></Link>
          </section>
        ) : (
          <>
            <section className="cart-v4-stack" aria-label="المنتجات في السلة">
              {items.length > 1 && (
                <Button type="button" variant="ghost" size="icon" className="cart-v4-nav is-prev" onClick={() => move(-1)} aria-label="المنتج السابق">
                  <ChevronRight aria-hidden="true" />
                </Button>
              )}
              {items.map((item, index) => {
                const previous = (safeIndex - 1 + items.length) % items.length;
                const next = (safeIndex + 1) % items.length;
                const position = index === previous ? "right" : index === next ? "left" : "hidden";
                return (
                  <CartProductCard
                    key={item.productId}
                    item={item}
                    details={detailsQ.data?.[item.productId]}
                    active={index === safeIndex}
                    position={position}
                    onSelect={() => setActiveIndex(index)}
                    onQuantity={(quantity) => updateQty(item.productId, quantity)}
                    formatAmount={formatAmount}
                  />
                );
              })}
              {items.length > 1 && (
                <Button type="button" variant="ghost" size="icon" className="cart-v4-nav is-next" onClick={() => move(1)} aria-label="المنتج التالي">
                  <ChevronLeft aria-hidden="true" />
                </Button>
              )}
            </section>

            <section className="cart-v4-order-summary" aria-label="ملخص الطلب">
              <h2>ملخص الطلب</h2>
              <div><span>عدد المنتجات</span><b>{items.length}</b></div>
              <div><span>عدد الحسابات</span><b>{count}</b></div>
              <div className="is-total"><span>{items.length === 1 ? "سعر المنتج بعد الخصم" : "اجمالي مبلغ المنتجات"}</span><b>{formatAmount(totalEgp)}</b></div>
            </section>

            <footer className="cart-v4-bottom-bar">
              <Button onClick={() => navigate({ to: "/checkout" })} className="cart-v4-checkout">إتمام الشراء</Button>
              <Link to="/shop" className="cart-v4-add"><span>إضافة منتج آخر</span></Link>
            </footer>
          </>
        )}
      </main>
      <WhatsAppFab className="bottom-[92px]" />
    </div>
  );
}