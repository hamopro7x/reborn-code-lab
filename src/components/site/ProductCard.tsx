import { Link } from "@tanstack/react-router";
import { useCurrency } from "@/lib/currency-context";
import { convertFromEgp, formatPrice, computeDiscountedPrice } from "@/lib/format";
import { Heart, ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useFavorites } from "@/lib/favorites";
import { toast } from "sonner";

export function ProductCard({ p }: { p: any }) {
  const { currency, rates } = useCurrency();
  const { add } = useCart();
  const { isFavorite, toggle } = useFavorites();
  const rate = rates[currency.code] ?? 1;
  const price = computeDiscountedPrice(p.base_price_egp, p.discount_percent ?? 0);
  const localized = convertFromEgp(price, rate, currency.code);
  const original = convertFromEgp(p.base_price_egp, rate, currency.code);
  const hasDiscount = (p.discount_percent ?? 0) > 0;
  const fav = isFavorite(p.id);

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

  const onFav = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const added = toggle(p.id);
    toast.success(added ? "تمت الإضافة إلى المفضلة" : "تمت الإزالة من المفضلة");
  };

  return (
    <Link
      to="/product/$slug"
      params={{ slug: p.slug }}
      className="group rounded-xl border border-border bg-card text-card-foreground overflow-hidden flex flex-col transition-colors duration-150 hover:border-primary"
    >
      <div className="relative aspect-[3/4] bg-muted overflow-hidden">
        {p.main_image ? (
          <img
            src={p.main_image}
            alt={p.name}
            width={600}
            height={600}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
            {p.name}
          </div>
        )}
        {p.category?.name && (
          <span className="absolute top-1.5 right-1.5 rounded-md bg-panel px-1.5 py-0.5 text-[10px] font-bold text-panel-foreground max-w-[70%] truncate">
            {p.category.name}
          </span>
        )}
        {hasDiscount && (
          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-discount px-1.5 py-0.5 text-[10px] font-bold text-discount-foreground">
            -{p.discount_percent}%
          </span>
        )}
      </div>

      <div className="px-2 pt-1.5 pb-2 flex flex-col gap-1 min-w-0">
        <h3 className="text-xs font-bold line-clamp-1 min-w-0">{p.name}</h3>

        <div className="flex items-end justify-between gap-2 min-w-0">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-base font-black text-card-foreground truncate">
              {formatPrice(localized, currency)}
            </span>
            {hasDiscount && (
              <span className="text-[11px] text-muted-foreground line-through truncate">
                {formatPrice(original, currency)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onAdd}
              aria-label={`أضف ${p.name} إلى السلة`}
              className="text-muted-foreground hover:text-primary transition-colors duration-150"
            >
              <ShoppingCart className="size-4" />
            </button>
            <button
              type="button"
              onClick={onFav}
              aria-label={fav ? `إزالة ${p.name} من المفضلة` : `أضف ${p.name} إلى المفضلة`}
              className={fav ? "text-primary" : "text-muted-foreground hover:text-primary transition-colors duration-150"}
            >
              <Heart className="size-4" fill={fav ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}
