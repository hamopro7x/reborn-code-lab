import { useNavigate } from "@tanstack/react-router";
import { useCurrency } from "@/lib/currency-context";
import { convertFromEgp, formatPrice, computeDiscountedPrice } from "@/lib/format";
import { Lock } from "lucide-react";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";

export function ProductCard({ p }: { p: any }) {
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
      className="group w-[340px] max-w-full shrink-0 cursor-pointer rounded-[20px] border border-[#24252f] bg-[#14151c] overflow-hidden transition-colors duration-150 hover:border-primary"
      style={{ boxShadow: "0 24px 48px -20px rgba(0,0,0,0.35)" }}
    >
      <div className="px-6 pt-[26px] pb-[22px] flex flex-col">
        {/* header: app icon + name + rating */}
        <div className="flex items-center gap-3">
          <div className="size-[52px] rounded-[14px] overflow-hidden shrink-0 bg-[#1d1e27] border border-[#2a2b38] flex items-center justify-center">
            {p.main_image ? (
              <img src={p.main_image} alt={p.name} width={104} height={104} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <span className="text-[10px] text-muted-foreground px-1 text-center line-clamp-2">{p.name}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15.5px] font-bold text-[#f5f6fa] leading-[1.3] line-clamp-1">{p.name}</h3>
            {rating !== null && (
              <div className="mt-1 flex items-center gap-[5px]">
                <svg viewBox="0 0 24 24" fill="#ffc94d" className="size-[13px]"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2z" /></svg>
                <span className="text-[12px] font-bold text-[#d6d8e2]">{rating}</span>
                {ratingCount !== null && (
                  <span className="text-[11.5px] text-[#6f7280]">({ratingCount.toLocaleString("en-US")} تقييم)</span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onFav}
            aria-label={fav ? `إزالة ${p.name} من المفضلة` : `أضف ${p.name} إلى المفضلة`}
            className={fav ? "size-9 inline-flex items-center justify-center rounded-[9px] bg-[#22c55e]/10 text-primary shrink-0" : "size-9 inline-flex items-center justify-center rounded-[9px] bg-[#1d1e27] border border-[#2a2b38] text-muted-foreground hover:text-primary hover:border-primary transition-colors shrink-0"}
          >
            <Heart className="size-4" fill={fav ? "currentColor" : "none"} />
          </button>
        </div>

        {/* features */}
        <div className="mt-3 flex flex-col gap-2">
          {features.map((text, i) => (
            <div key={i} className="flex items-start gap-2 text-[12.5px] text-[#a7a9b8] leading-[1.5]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-[15px] shrink-0 mt-[2px]"><path d="M20 6L9 17l-5-5" /></svg>
              <span className="line-clamp-1">{text}</span>
            </div>
          ))}
        </div>

        <div className="h-px bg-[#24252f] my-[18px]" />

        {/* price row */}
        <div className="flex items-end justify-between gap-2">
          <div className="flex flex-col gap-[3px] min-w-0">
            <span className="text-[11.5px] text-[#6f7280]">السعر شامل الضريبة</span>
            <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
              <span className="text-[26px] font-extrabold text-white leading-none">{formatPrice(localized, { ...currency, symbol: "" }).trim()}</span>
              <span className="text-[12px] font-bold text-white">{currency.symbol}</span>
              {hasDiscount && (
                <span className="text-[13px] font-medium text-[#6f7280] line-through">{formatPrice(original, currency)}</span>
              )}
            </div>
          </div>
          {hasDiscount && (
            <span className="text-[11.5px] font-extrabold text-[#22c55e] bg-[#22c55e]/10 px-[9px] py-[5px] rounded-[7px] whitespace-nowrap">
              وفّر {p.discount_percent}%
            </span>
          )}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={onAdd}
          aria-label={`أضف ${p.name} إلى السلة`}
          className="mt-[18px] block w-full text-center bg-[#f5f6fa] text-[#14151c] text-[14.5px] font-bold py-[13px] rounded-[11px] hover:bg-white transition-colors"
        >
          اطلب الآن
        </button>

        {/* footnote */}
        <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[#6f7280]">
          <Lock className="size-[13px]" />
          <span>دفع آمن ومضمون 100%</span>
        </div>
      </div>
    </div>
  );
}
