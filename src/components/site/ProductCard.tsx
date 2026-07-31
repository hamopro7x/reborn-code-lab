import { Link } from "@tanstack/react-router";
import { useCurrency } from "@/lib/currency-context";
import { convertFromEgp, formatPrice, computeDiscountedPrice } from "@/lib/format";
import { Sparkles, ShieldCheck } from "lucide-react";

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
      className="group card-surface rounded-2xl overflow-hidden hover:glow-purple transition-all duration-500 hover:-translate-y-1 animate-slide-up flex flex-col"
    >
      <div className="relative aspect-[4/3] bg-gradient-to-br from-primary/20 via-accent/10 to-background overflow-hidden">
        {p.main_image ? (
          <img src={p.main_image} alt={p.name} width={640} height={480} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl opacity-40">
            {p.category?.icon ?? "🎁"}
          </div>
        )}
        {hasDiscount && (
          <div className="absolute top-3 right-3 gradient-gold text-black text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
            <Sparkles className="size-3" />
            خصم {p.discount_percent}%
          </div>
        )}
        {p.featured && (
          <div className="absolute top-3 left-3 bg-black/60 backdrop-blur text-white text-[10px] px-2 py-1 rounded-full">مميز</div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col gap-2">
        <h3 className="font-bold text-sm line-clamp-2 group-hover:text-primary transition-colors">{p.name}</h3>
        {p.short_description && <p className="text-xs text-muted-foreground line-clamp-2">{p.short_description}</p>}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {p.warranty_days > 0 && (
            <><ShieldCheck className="size-3 text-primary" /> ضمان {p.warranty_days} يوم</>
          )}
        </div>
        <div className="mt-auto pt-2 flex items-baseline gap-2">
          <span className="text-lg font-black text-gradient">{formatPrice(localized, currency)}</span>
          {hasDiscount && (
            <span className="text-xs text-muted-foreground line-through">{formatPrice(original, currency)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}