export type OkxHistoryKind = "funding" | "bills" | "orders";
export type OkxInstrument = "SPOT" | "MARGIN" | "SWAP" | "FUTURES" | "OPTION" | "EVENTS";
export type OkxHistoryRow = {
  id: string; time: number; label: string; currency: string;
  amount: string; fee: string | null; feeCurrency: string;
  status: string; instrument: string; price: string; note: string;
};

const fundingTypes: Record<string, string> = {
  "1": "إيداع", "2": "سحب", "13": "إلغاء سحب", "47": "عكس من المنصة",
  "116": "طلب عملة نقدية", "117": "تنفيذ طلب عملة نقدية", "118": "إلغاء طلب عملة نقدية",
  "130": "من حساب التداول", "131": "إلى حساب التداول",
  "132": "تجميد P2P بواسطة خدمة العملاء", "133": "فك تجميد P2P بواسطة خدمة العملاء",
  "134": "تحويل P2P بواسطة خدمة العملاء", "221": "رسوم سحب", "222": "رد رسوم سحب",
};

// Keep provider amounts as decimal strings: bills are balance changes, not purchases.
export function mapOkxHistory(row: Record<string, unknown>, kind: OkxHistoryKind): OkxHistoryRow {
  const str = (key: string) => String(row[key] ?? "");
  const orders = kind === "orders";
  const state = str("state");
  return {
    id: str(orders ? "ordId" : "billId"),
    time: Number(row[orders ? "cTime" : "ts"] ?? 0),
    label: orders ? (str("side") === "buy" ? "شراء" : str("side") === "sell" ? "بيع" : str("side"))
      : kind === "funding" ? fundingTypes[str("type")] ?? `حركة تمويل · ${str("type")}`
      : `حركة تداول · ${str("type")}/${str("subType")}`,
    currency: str("ccy"), amount: str(orders ? "accFillSz" : "balChg"),
    fee: row.fee === undefined ? null : str("fee"), feeCurrency: str("feeCcy") || str("ccy"),
    status: orders ? ({ filled: "مكتملة", canceled: "ملغاة", mmp_canceled: "ملغاة", live: "مفتوحة", partially_filled: "منفذة جزئيًا" }[state] ?? state) : "مسجلة",
    instrument: str("instId"), price: str("avgPx"), note: str("notes"),
  };
}

export function okxHistoryCursor(rows: Record<string, unknown>[], kind: OkxHistoryKind): string | null {
  if (rows.length < 100) return null;
  const last = rows[rows.length - 1];
  const cursor = String(last?.[kind === "funding" ? "ts" : kind === "orders" ? "ordId" : "billId"] ?? "");
  return cursor || null;
}