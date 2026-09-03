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
      className="group rounded-xl border border-border bg-card text-card-foreground overflow-hidden flex flex-col transition-colors duration-150 hover:border-primary md:w-[6cm] md:h-[7cm]"
    >
      <div className="relative aspect-[4/3] md:aspect-auto md:flex-1 md:min-h-0 bg-muted overflow-hidden">
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
          <span className="absolute top-1.5 right-1.5 md:top-0.5 md:right-0.5 rounded-md bg-panel px-1.5 py-0.5 md:px-1 md:py-0 text-[10px] md:text-[7px] font-bold text-panel-foreground max-w-[70%] truncate">
            {p.category.name}
          </span>
        )}
        {hasDiscount && (
          <span className="absolute bottom-1.5 left-1.5 md:bottom-0.5 md:left-0.5 rounded-md bg-discount px-1.5 py-0.5 md:px-1 md:py-0 text-[10px] md:text-[7px] font-bold text-discount-foreground">
            -{p.discount_percent}%
          </span>
        )}
      </div>

      <div className="px-3 py-2.5 md:px-1.5 md:py-1 flex flex-col gap-0.5 md:gap-0 min-w-0 border-t border-border md:shrink-0">
        <h3 className="text-xs md:text-[8px] md:leading-tight font-bold line-clamp-1 min-w-0">{p.name}</h3>

        <div className="flex items-end justify-between gap-2 md:gap-1 min-w-0">
          <div className="flex items-baseline gap-1.5 md:gap-1 min-w-0">
            <span className="text-sm md:text-[9px] font-black text-card-foreground truncate">
              {formatPrice(localized, currency)}
            </span>
            {hasDiscount && (
              <span className="text-[10px] md:text-[7px] text-muted-foreground line-through truncate">
                {formatPrice(original, currency)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 md:gap-1 shrink-0">
            <button
              type="button"
              onClick={onAdd}
              aria-label={`أضف ${p.name} إلى السلة`}
              className="text-muted-foreground hover:text-primary transition-colors duration-150"
            >
              <ShoppingCart className="size-3.5 md:size-2.5" />
            </button>
            <button
              type="button"
              onClick={onFav}
              aria-label={fav ? `إزالة ${p.name} من المفضلة` : `أضف ${p.name} إلى المفضلة`}
              className={fav ? "text-primary" : "text-muted-foreground hover:text-primary transition-colors duration-150"}
            >
              <Heart className="size-3.5 md:size-2.5" fill={fav ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}
