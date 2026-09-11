import { useNavigate } from "@tanstack/react-router";
import { useCurrency } from "@/lib/currency-context";
import { convertFromEgp, formatPrice, computeDiscountedPrice } from "@/lib/format";
import { Heart, ShoppingCart, ShieldCheck, Check, Lock, Zap, Headset } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useFavorites } from "@/lib/favorites";
import { toast } from "sonner";

export function ProductCard({ p }: { p: any }) {
  const { currency, rates } = useCurrency();
  const navigate = useNavigate();
  const { add } = useCart();
  const { isFavorite, toggle } = useFavorites();
  const rate = rates[currency.code] ?? 1;
  const price = computeDiscountedPrice(p.base_price_egp, p.discount_percent ?? 0);
  const localized = convertFromEgp(price, rate, currency.code);
  const original = convertFromEgp(p.base_price_egp, rate, currency.code);
  const hasDiscount = (p.discount_percent ?? 0) > 0;
  const fav = isFavorite(p.id);
  const warranty = p.warranty_text?.trim() || (p.warranty_days > 0 ? `ضمان ${p.warranty_days} يوم` : null);

  const features: { icon: React.ReactNode; text: string }[] = [];
  if (warranty) features.push({ icon: <ShieldCheck className="size-3.5 shrink-0 mt-0.5" />, text: warranty });
  features.push({ icon: <Zap className="size-3.5 shrink-0 mt-0.5" />, text: "تفعيل فوري بعد إتمام الطلب" });
  features.push({ icon: <Headset className="size-3.5 shrink-0 mt-0.5" />, text: "دعم فني متواصل بعد الشراء" });

  const onAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      add({
        productId: p.id,
        slug: p.slug,
        name: p.name,
        image: p.main_image,
        basePriceEgp: Number(p.base_price_egp),
        discountPercent: Number(p.discount_percent ?? 0),
        warrantyDays: Number(p.warranty_days ?? 0),
      });
    } catch {
      toast.error("تعذر إضافة المنتج إلى السلة");
      return;
    }
    toast.success("تمت الإضافة إلى السلة");
    navigate({ to: "/cart" });
  };

  const onFav = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const added = toggle(p.id);
    toast.success(added ? "تمت الإضافة إلى المفضلة" : "تمت الإزالة من المفضلة");
  };

  const onOpen = () => navigate({ to: "/product/$slug", params: { slug: p.slug } });

  return (
    <div
      onClick={onOpen}
      className="group rounded-2xl border border-[#24252f] bg-[#14151c] overflow-hidden flex flex-col transition-colors duration-150 hover:border-primary cursor-pointer md:w-[6cm]"
    >
      <div className="p-5 md:p-6 flex flex-col flex-1">
        {/* header: icon + name + favorite */}
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onFav}
            aria-label={fav ? `إزالة ${p.name} من المفضلة` : `أضف ${p.name} إلى المفضلة`}
            className={fav ? "text-primary shrink-0 mt-0.5" : "text-muted-foreground hover:text-primary transition-colors shrink-0 mt-0.5"}
          >
            <Heart className="size-4" fill={fav ? "currentColor" : "none"} />
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[#f5f6fa] leading-snug line-clamp-3">{p.name}</h3>
          </div>
          <div className="size-12 rounded-xl bg-[#1d1e27] border border-[#2a2b38] overflow-hidden flex items-center justify-center shrink-0">
            {p.main_image ? (
              <img src={p.main_image} alt={p.name} width={96} height={96} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <span className="text-[10px] text-muted-foreground px-1 text-center line-clamp-2">{p.name}</span>
            )}
          </div>
        </div>

        {/* features */}
        <div className="mt-4 flex flex-col gap-1.5">
          {features.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-[11.5px] text-[#a7a9b8] leading-snug">
              <span className="text-[#22c55e] shrink-0">{f.icon}</span>
              <span className="line-clamp-2">{f.text}</span>
            </div>
          ))}
        </div>

        <div className="h-px bg-[#24252f] my-4" />

        {/* price row */}
        <div className="flex items-end justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[10.5px] text-[#6f7280]">السعر شامل الضريبة</span>
            <div className="flex items-baseline gap-1.5 min-w-0 flex-wrap">
              <span className="text-xl font-extrabold text-white leading-none">{formatPrice(localized, { ...currency, symbol: "" }).trim()}</span>
              <span className="text-[11px] font-bold text-white">{currency.symbol}</span>
              {hasDiscount && (
                <span className="text-[11px] text-[#6f7280] line-through">{formatPrice(original, currency)}</span>
              )}
            </div>
          </div>
          {hasDiscount && (
            <span className="text-[10.5px] font-extrabold text-[#22c55e] bg-[#22c55e]/10 px-2 py-1 rounded-md whitespace-nowrap">
              وفّر {p.discount_percent}%
            </span>
          )}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={onAdd}
          aria-label={`أضف ${p.name} إلى السلة`}
          className="mt-4 w-full inline-flex items-center justify-center gap-1.5 bg-[#f5f6fa] text-[#14151c] rounded-xl py-2.5 text-sm font-bold hover:bg-white transition-colors"
        >
          <ShoppingCart className="size-4" />
          <span>اطلب الآن</span>
        </button>

        {/* footnote */}
        <div className="mt-3 flex items-center justify-center gap-1.5 text-[10.5px] text-[#6f7280]">
          <Lock className="size-3" />
          <span>دفع آمن ومضمون 100%</span>
        </div>
      </div>
    </div>
  );
}
