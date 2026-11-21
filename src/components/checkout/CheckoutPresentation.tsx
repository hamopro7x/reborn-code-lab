import { Check, CreditCard, ShoppingBag } from "lucide-react";
import { formatPrice } from "@/lib/format";
import vodafoneIcon from "@/assets/payment-icons/vodafone.svg.asset.json";
import binanceIcon from "@/assets/payment-icons/binance.svg.asset.json";
import bybitIcon from "@/assets/payment-icons/bybit.png.asset.json";

const STEPS = [
  { key: "cart", label: "المنتج" },
  { key: "info", label: "البيانات" },
  { key: "payment", label: "الدفع" },
  { key: "screenshot", label: "التأكيد" },
] as const;

type CheckoutStep = "info" | "payment" | "screenshot" | "done";

const PAYMENT_ICONS = [
  { terms: ["vodafone", "فودافون"], src: vodafoneIcon.url },
  { terms: ["binance", "بينانس"], src: binanceIcon.url },
  { terms: ["bybit", "بايبت", "باي بيت"], src: bybitIcon.url },
] as const;

function getPaymentIconMatch(method: any) {
  const searchableName = `${method?.name ?? ""} ${method?.type ?? ""}`.toLowerCase();
  return PAYMENT_ICONS.find(({ terms }) => terms.some((term) => searchableName.includes(term)));
}

function PaymentMethodIcon({ method }: { method: any }) {
  const match = getPaymentIconMatch(method);
  const customIcon = String(method?.icon ?? "").trim();
  const customImage = /^(https?:\/\/|\/)/i.test(customIcon);

  return (
    <span className="checkout-payment-icon-shell" aria-hidden="true">
      {customImage
        ? <img src={customIcon} alt="" />
        : customIcon
          ? <span className="text-xl leading-none">{customIcon}</span>
          : match
            ? <img src={match.src} alt="" />
            : <CreditCard className="checkout-payment-icon" />}
    </span>
  );
}

function Stepper({ step }: { step: CheckoutStep }) {
  const displayStep = step === "done" ? "screenshot" : step;
  const currentIndex = STEPS.findIndex((s) => s.key === displayStep);
  return (
    <div className="checkout-steps">
      {STEPS.map((s, i) => {
        const isActive = s.key === displayStep;
        const isPast = currentIndex > i;
        return (
          <div key={s.key} className="checkout-step">
            {i > 0 && <span className={`checkout-step-line ${i <= currentIndex ? "is-done" : ""}`} />}
            <span className={`checkout-step-circle ${isActive ? "is-active" : ""} ${isPast ? "is-done" : ""}`}>
              {isPast ? <Check aria-hidden="true" /> : i + 1}
            </span>
            <span className={`checkout-step-label ${isActive || isPast ? "is-on" : ""}`}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function OrderSummary({ total, originalTotal, currency, items }: { total: number; originalTotal: number; currency: any; items: any[] }) {
  const discount = Math.max(0, originalTotal - total);
  return (
    <section className="checkout-summary" aria-label="ملخص الطلب">
      <div className="checkout-summary-head">
        <ShoppingBag className="checkout-summary-icon" aria-hidden="true" />
        <div className="min-w-0">
          <h2>{items[0]?.name ?? "طلبك"}{items.length > 1 ? ` و${items.length - 1} منتجات أخرى` : ""}</h2>
          <p>{items.reduce((sum, item) => sum + item.quantity, 0)} منتج · تفعيل بعد تأكيد الدفع</p>
        </div>
      </div>
      <div className="checkout-price-lines">
        <div><span>السعر الأصلي</span><b className={discount > 0 ? "is-old" : ""}>{formatPrice(originalTotal, currency)}</b></div>
        {discount > 0 && <div className="is-discount"><span>الخصم</span><b>− {formatPrice(discount, currency)}</b></div>}
        <div className="is-total"><span>الإجمالي</span><b>{formatPrice(total, currency)}</b></div>
      </div>
    </section>
  );
}

export { PaymentMethodIcon, Stepper, OrderSummary };
export type { CheckoutStep };
