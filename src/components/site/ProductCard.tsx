import { useNavigate } from "@tanstack/react-router";
import { useCurrency } from "@/lib/currency-context";
import { convertFromEgp, formatPrice, computeDiscountedPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Heart } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useFavorites } from "@/lib/favorites";
import { toast } from "sonner";
import { SafeImage } from "@/components/site/SafeImage";

export function ProductCard({ p, compact = false }: { p: any; compact?: boolean }) {
  const { currency, rates } = useCurrency();
  const navigate = useNavigate();
  const { add } = useCart();
  const { isFavorite, toggle } = useFavorites();
  const rate = rates[currency.code] ?? 1;
  const price = computeDiscountedPrice(p.base_price_egp, p.discount_percent ?? 0);
  const localized = convertFromEgp(price, rate, currency.code);
  const original = convertFromEgp(p.base_price_egp, rate, currency.code);
  const hasDiscount = (p.discount_percent ?? 0) > 0;
  const warranty = p.warranty_text?.trim() || (p.warranty_days > 0 ? `ضمان ${p.warranty_days} يوم` : null);
  const fav = isFavorite(p.id);

  const features: string[] = [];
  if (warranty) features.push(warranty);
  features.push("تفعيل فوري بعد إتمام الطلب");
  features.push("دعم فني متواصل بعد الشراء");

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

  const onOpen = () => navigate({ to: "/product/$slug", params: { slug: p.slug } });

  return (
    <div className={cn("flex flex-col items-stretch", compact ? "w-full" : "w-[200px] max-w-full shrink-0")}>
      <div
        onClick={onOpen}
        className="group cursor-pointer rounded-[20px] border border-[#24252f] bg-[#14151c] overflow-hidden"
        style={{ boxShadow: "0 18px 36px -18px rgba(0,0,0,0.35)" }}
      >
        <div className="px-[14px] pt-4 pb-[14px] flex flex-col">
          {/* header: app icon + name */}
          <div className="flex items-center gap-[6px]">
            <div className="size-[52px] rounded-[14px] shrink-0 overflow-hidden bg-[#1d1e27] border border-[#2a2b38] flex items-center justify-center">
              <SafeImage
                src={p.main_image ?? undefined}
                alt={p.name}
                width={104}
                height={104}
                className="h-full w-full object-cover"
                fallbackClassName="gap-1 [&_svg]:size-4 [&_span]:text-[9px]"
                loading="lazy"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[13px] font-extrabold text-[#f5f6fa] leading-[1.35] text-right line-clamp-2">{p.name}</h3>
            </div>
          </div>

          <div className="w-full h-px my-2 bg-[#24252f]" />

          {/* features */}
          <div className="flex flex-col gap-[6px]">
            {features.map((text, i) => (
              <div key={i} className="flex items-start gap-[6px] text-[12.5px] text-[#a7a9b8] leading-[1.5]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-[15px] shrink-0 mt-[2px]"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span className="line-clamp-1">{text}</span>
              </div>
            ))}
          </div>

          <div className="h-px bg-[#24252f] mt-[10px] mb-[5px]" />

          {/* price row */}
          <div className="flex items-end justify-between gap-2 mt-2">
            <div className="flex flex-col gap-[5px] min-w-0">
              <span className="text-[11.5px] text-[#6f7280]">السعر</span>
              <div className="flex items-baseline gap-[5px] min-w-0 flex-wrap translate-y-[4px]">
                <span className="text-[18px] font-black text-white leading-none">
                  {formatPrice(localized, { ...currency, symbol: "" }).trim()}
                </span>
                <span className="text-[12px] font-extrabold text-white">{currency.symbol}</span>
                {hasDiscount && (
                  <span className="text-[11px] font-medium text-[#7f879a] line-through whitespace-nowrap">{formatPrice(original, currency)}</span>
                )}
              </div>
            </div>
            {hasDiscount && (
              <span className="self-start text-[11.5px] font-extrabold text-[#22c55e] bg-[#22c55e]/[0.12] px-[9px] py-[5px] rounded-[7px] whitespace-nowrap">
                وفّر {p.discount_percent}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* unified action bar */}
      <div className="mt-2 h-[46px] flex items-stretch overflow-hidden rounded-[13px] border border-white/[0.12] bg-[#0f1423]">
        <button
          type="button"
          onClick={onAdd}
          aria-label={`أضف ${p.name} إلى السلة`}
          className="flex-1 min-h-[46px] text-center bg-[#f5f6fa] text-[#14151c] text-[14.5px] font-bold hover:bg-white transition-colors"
        >
          اطلب الآن
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle(p.id);
          }}
          aria-label="إضافة إلى المفضلة"
          aria-pressed={fav}
          className={cn(
            "w-12 min-w-12 h-[46px] grid place-items-center border-r border-[#14141e]/[0.18] transition-colors",
            fav ? "text-[#ff4f87] bg-[#ff4f87]/[0.06]" : "text-[#d9deeb] hover:text-[#ff6b9a] hover:bg-white/[0.035]"
          )}
        >
          <Heart className="size-[21px]" fill={fav ? "currentColor" : "none"} />
        </button>
      </div>
    </div>
  );
}
