import { Link } from "@tanstack/react-router";
import { useCurrency } from "@/lib/currency-context";
import { convertFromEgp, formatPrice, computeDiscountedPrice } from "@/lib/format";
import { ShieldCheck } from "lucide-react";

export function ProductCard({ p }: { p: any }) {
  const { currency, rates } = useCurrency();
  const rate = rates[currency.code] ?? 1;
  const price = computeDiscountedPrice(p.base_price_egp, p.discount_percent ?? 0);
  const localized = convertFromEgp(price, rate, currency.code);
  const original = convertFromEgp(p.base_price_egp, rate, currency.code);
  const hasDiscount = (p.discount_percent ?? 0) > 0;

  return (
    <Link
      to="/product/$slug"
      params={{ slug: p.slug }}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/25"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
        {p.main_image ? (
          <img
            src={p.main_image}
            alt={p.name}
            width={640}
            height={480}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            لا توجد صورة
          </div>
        )}
        {hasDiscount && (
          <div className="absolute right-3 top-3 rounded border border-border bg-background/90 px-2 py-0.5 text-xs font-medium">
            خصم <span className="num">{p.discount_percent}%</span>
          </div>
        )}
        {p.featured && (
          <div className="absolute left-3 top-3 rounded border border-border bg-background/90 px-2 py-0.5 text-[11px] text-muted-foreground">
            مميز
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-semibold">{p.name}</h3>
        {p.short_description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{p.short_description}</p>
        )}
        {p.warranty_days > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5" /> ضمان <span className="num">{p.warranty_days}</span> يوم
          </div>
        )}
        <div className="mt-auto flex items-baseline gap-2 pt-2">
          <span className="num text-base font-semibold">{formatPrice(localized, currency)}</span>
          {hasDiscount && (
            <span className="num text-xs text-muted-foreground line-through">
              {formatPrice(original, currency)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
