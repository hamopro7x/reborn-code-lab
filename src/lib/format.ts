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

type DateValue = string | number | Date | null | undefined;

/** Display only: preserve the caller's locale/time zone and always use 12 hours. */
export function formatLocaleDateTime(value: DateValue, locale = "ar-EG", options: Intl.DateTimeFormatOptions = {}): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale, { ...options, hour12: true });
}

export function formatTime(value: DateValue, options: Intl.DateTimeFormatOptions = {}): string {
  return formatLocaleDateTime(value, "ar-EG", { numberingSystem: "latn", hour: "2-digit", minute: "2-digit", ...options });
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  const day = d.toLocaleDateString("ar-EG", { weekday: "long", numberingSystem: "latn" });
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = formatTime(d, { second: "2-digit" });
  return `${day} - ${date} - ${time}`;
}

export function formatDateOnly(value: string | number | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  const day = d.toLocaleDateString("ar-EG", { weekday: "long", numberingSystem: "latn" });
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${day} - ${date}`;
}