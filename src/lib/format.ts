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