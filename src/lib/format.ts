export function formatPrice(amount: number, currency: { code: string; symbol: string }): string {
  const opts: Intl.NumberFormatOptions = {
    minimumFractionDigits: 0,
    maximumFractionDigits: currency.code === "IQD" ? 0 : 2,
  };
  return `${currency.symbol} ${new Intl.NumberFormat("en-US", opts).format(amount)}`;
}

export function convertFromEgp(amountEgp: number, rateFromEgp: number, currencyCode: string): number {
  const raw = amountEgp * rateFromEgp;
  if (currencyCode === "IQD") return Math.round(raw / 250) * 250;
  if (currencyCode === "USD") return Math.round(raw * 100) / 100;
  return Math.round(raw * 100) / 100;
}

export function computeDiscountedPrice(price: number, discountPercent: number): number {
  if (!discountPercent) return price;
  return price * (1 - discountPercent / 100);
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  const day = d.toLocaleDateString("ar-EG", { weekday: "long", numberingSystem: "latn" });
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  const [timePart, ampm] = time.split(" ");
  const ampmAr = ampm?.toLowerCase() === "am" ? "ص" : "م";
  return `${day} - ${date} - ${timePart} ${ampmAr}`;
}

export function formatDateOnly(value: string | number | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  const day = d.toLocaleDateString("ar-EG", { weekday: "long", numberingSystem: "latn" });
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${day} - ${date}`;
}