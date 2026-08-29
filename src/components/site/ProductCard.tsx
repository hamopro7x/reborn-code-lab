import { Link } from "@tanstack/react-router";
import { useCurrency } from "@/lib/currency-context";
import { convertFromEgp, formatPrice, computeDiscountedPrice } from "@/lib/format";
import { ShieldCheck, ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";

export function ProductCard({ p }: { p: any }) {
  const { currency, rates } = useCurrency();
  const { add } = useCart();
  const rate = rates[currency.code] ?? 1;
  const price = computeDiscountedPrice(p.base_price_egp, p.discount_percent ?? 0);
  const localized = convertFromEgp(price, rate, currency.code);
  const original = convertFromEgp(p.base_price_egp, rate, currency.code);
  const hasDiscount = (p.discount_percent ?? 0) > 0;

  const onAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    add({
      productId: p.id,
      slug: p.slug,
      name: p.name,
      image: p.main_image,
      basePriceEgp: Number(p.base_price_egp),
      discountPercent: Number(p.discount_percent ?? 0),
      warrantyDays: Number(p.warranty_days ?? 0),
    });
    toast.success("تمت الإضافة إلى السلة");
  };

  return (
    <Link
      to="/product/$slug"
      params={{ slug: p.slug }}
      className="group rounded-xl border border-border bg-card overflow-hidden flex flex-col transition-colors duration-150 hover:border-lime/60"
    >
      <div className="relative aspect-[4/5] bg-secondary overflow-hidden">
        {p.main_image ? (
          <img
            src={p.main_image}
            alt={p.name}
            width={480}
            height={600}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
            {p.name}
          </div>
        )}
        {hasDiscount && (
          <span className="absolute top-2 right-2 rounded-md bg-lime px-2 py-0.5 text-[11px] font-bold text-lime-foreground">
            خصم {p.discount_percent}%
          </span>
        )}
        {p.category?.name && (
          <span className="absolute top-2 left-2 rounded-md border border-border bg-background/85 px-2 py-0.5 text-[10px] max-w-[70%] truncate">
            {p.category.name}
          </span>
        )}
      </div>

      <div className="p-3 flex-1 flex flex-col gap-1.5 min-w-0">
        <h3 className="text-sm font-bold line-clamp-2 min-w-0">{p.name}</h3>
        {p.warranty_days > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0" />
            ضمان {p.warranty_days} يوم
          </div>
        )}
        <div className="mt-auto pt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="min-w-0">
            <div className="text-base font-black text-lime truncate">{formatPrice(localized, currency)}</div>
            {hasDiscount && (
              <div className="text-[11px] text-muted-foreground line-through truncate">
                {formatPrice(original, currency)}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onAdd}
            aria-label={`أضف ${p.name} إلى السلة`}
            className="size-9 shrink-0 rounded-lg border border-border flex items-center justify-center hover:bg-secondary hover:border-lime hover:text-lime transition-colors duration-150"
          >
            <ShoppingCart className="size-4" />
          </button>
        </div>
      </div>
    </Link>
  );
}
