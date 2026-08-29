import { Link } from "@tanstack/react-router";
import { useCurrency } from "@/lib/currency-context";
import { convertFromEgp, formatPrice, computeDiscountedPrice } from "@/lib/format";

/**
 * كارت أفقي مختصر لبطاقات الشحن — نفس بيانات المنتج الموجودة بدون أي مصادر جديدة.
 */
export function TopupCard({ p }: { p: any }) {
  const { currency, rates } = useCurrency();
  const rate = rates[currency.code] ?? 1;
  const price = convertFromEgp(
    computeDiscountedPrice(p.base_price_egp, p.discount_percent ?? 0),
    rate,
    currency.code,
  );

  return (
    <Link
      to="/product/$slug"
      params={{ slug: p.slug }}
      className="group flex h-full items-center gap-3 rounded-xl border border-border bg-card text-card-foreground p-3 transition-colors duration-150 hover:border-primary"
    >
      <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
        {p.main_image ? (
          <img
            src={p.main_image}
            alt={p.name}
            width={96}
            height={96}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{p.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {p.category?.name ?? "بطاقة شحن"}
        </div>
        <div className="mt-1 text-sm font-black text-card-foreground">{formatPrice(price, currency)}</div>
      </div>
    </Link>
  );
}
