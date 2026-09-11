import { useNavigate } from "@tanstack/react-router";
import { useCurrency } from "@/lib/currency-context";
import { convertFromEgp, formatPrice, computeDiscountedPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";

export function ProductCard({ p, compact = false }: { p: any; compact?: boolean }) {
  const { currency, rates } = useCurrency();
  const navigate = useNavigate();
  const { add } = useCart();
  const rate = rates[currency.code] ?? 1;
  const price = computeDiscountedPrice(p.base_price_egp, p.discount_percent ?? 0);
  const localized = convertFromEgp(price, rate, currency.code);
  const original = convertFromEgp(p.base_price_egp, rate, currency.code);
  const hasDiscount = (p.discount_percent ?? 0) > 0;
  const warranty = p.warranty_text?.trim() || (p.warranty_days > 0 ? `ضمان ${p.warranty_days} يوم` : null);
  const rating = p.rating ? Number(p.rating) : null;
  const ratingCount = p.rating_count ? Number(p.rating_count) : null;

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
    <div
      onClick={onOpen}
      className={cn(
        "group cursor-pointer rounded-[20px] border border-[#24252f] bg-[#14151c] overflow-hidden transition-colors duration-150 hover:border-primary",
        compact ? "w-full" : "w-[280px] md:w-[340px] max-w-full shrink-0"
      )}
      style={{ boxShadow: "0 24px 48px -20px rgba(0,0,0,0.35)" }}
    >
      <div className={cn("flex flex-col", compact ? "px-3 pt-4 pb-3" : "px-6 pt-[26px] pb-[22px]")}>
        {/* header: app icon + name + rating */}
        <div className={cn("flex items-center gap-3", compact && "gap-2")}>
          <div
            className={cn(
              "overflow-hidden shrink-0 bg-[#1d1e27] border border-[#2a2b38] flex items-center justify-center",
              compact ? "size-10 rounded-[12px]" : "size-[52px] rounded-[14px]"
            )}
          >
            {p.main_image ? (
              <img src={p.main_image} alt={p.name} width={104} height={104} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <span className="text-[10px] text-muted-foreground px-1 text-center line-clamp-2">{p.name}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={cn("font-bold text-[#f5f6fa] leading-[1.3] line-clamp-1", compact ? "text-[13px]" : "text-[15.5px]")}>{p.name}</h3>
            {rating !== null && (
              <div className="mt-1 flex items-center gap-[5px]">
                <svg viewBox="0 0 24 24" fill="#ffc94d" className="size-[13px]">
                  <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2z" />
                </svg>
                <span className="font-bold text-[#d6d8e2] text-[12px]">{rating}</span>
                {ratingCount !== null && !compact && (
                  <span className="text-[11.5px] text-[#6f7280]">({ratingCount.toLocaleString("en-US")} )</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* features */}
        <div className={cn("flex flex-col gap-2", compact ? "mt-2" : "mt-3")}>
          {(compact ? features.slice(0, 2) : features).map((text, i) => (
            <div key={i} className={cn("flex items-start gap-2 text-[#a7a9b8] leading-[1.5]", compact ? "text-[11px]" : "text-[12.5px]")}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#22c55e"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn("shrink-0 mt-[2px]", compact ? "size-[13px]" : "size-[15px]")}
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span className="line-clamp-1">{text}</span>
            </div>
          ))}
        </div>

        <div className={cn("h-px bg-[#24252f]", compact ? "my-3" : "my-[18px]")} />

        {/* price row */}
        <div className="flex items-end justify-between gap-2">
          <div className="flex flex-col gap-[3px] min-w-0">
            <span className={cn("text-[#6f7280]", compact ? "text-[10px]" : "text-[11.5px]")}>السعر شامل الضريبة</span>
            <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
              <span className={cn("font-extrabold text-white leading-none", compact ? "text-[20px]" : "text-[26px]")}>
                {formatPrice(localized, { ...currency, symbol: "" }).trim()}
              </span>
              <span className={cn("font-bold text-white", compact ? "text-[11px]" : "text-[12px]")}>{currency.symbol}</span>
              {hasDiscount && (
                <span className={cn("font-medium text-[#6f7280] line-through", compact ? "text-[11px]" : "text-[13px]")}>{formatPrice(original, currency)}</span>
              )}
            </div>
          </div>
          {hasDiscount && (
            <span
              className={cn(
                "font-extrabold text-[#22c55e] bg-[#22c55e]/10 rounded-[7px] whitespace-nowrap",
                compact ? "text-[10px] px-[6px] py-[3px]" : "text-[11.5px] px-[9px] py-[5px]"
              )}
            >
              وفّر {p.discount_percent}%
            </span>
          )}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={onAdd}
          aria-label={`أضف ${p.name} إلى السلة`}
          className={cn(
            "block w-full text-center bg-[#f5f6fa] text-[#14151c] font-bold hover:bg-white transition-colors",
            compact ? "mt-3 text-[12.5px] py-[10px] rounded-[9px]" : "mt-[18px] text-[14.5px] py-[13px] rounded-[11px]"
          )}
        >
          اطلب الآن
        </button>

        {/* footnote */}
        <div className={cn("flex items-center justify-center gap-1.5 text-[#6f7280]", compact ? "mt-2 text-[10px]" : "mt-3 text-[11px]")}>
          <Lock className={compact ? "size-[11px]" : "size-[13px]"} />
          <span>دفع آمن ومضمون 100%</span>
        </div>
      </div>
    </div>
  );
}
