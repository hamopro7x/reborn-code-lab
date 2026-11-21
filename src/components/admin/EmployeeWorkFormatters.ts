export const num = (n: number, digits = 2) =>
  Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: digits });
