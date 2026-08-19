/**
 * Shared display metadata for one Bybit card transaction.
 *
 * The account's own log and the central ledger MUST render the same fields with
 * the same labels, so the field definitions and formatters live here instead of
 * being re-implemented per panel. Nothing in this module changes a value: it
 * only labels and formats what the source transaction already contains.
 */
import { formatDateTime } from "@/lib/format";

export type FieldDef = [string, string];

export const CORE_FIELDS: FieldDef[] = [
  ["txnId", "معرّف المعاملة"],
  ["orderId", "معرّف الطلب / المرجع"],
  ["paymentId", "معرّف الدفع"],
  ["authCode", "كود التفويض"],
  ["stage", "مرحلة المعاملة"],
  ["eventCode", "كود الحدث"],
  ["createdAt", "تاريخ الإنشاء"],
  ["updatedAt", "آخر تحديث"],
];

export const AMOUNT_FIELDS: FieldDef[] = [
  ["transactionAmount", "مبلغ المعاملة"],
  ["transactionCurrency", "عملة المعاملة"],
  ["localAmount", "المبلغ بالعملة المحلية"],
  ["localCurrency", "العملة المحلية"],
  ["grossAmount", "المبلغ الإجمالي"],
  ["netAmount", "الصافي"],
  ["feeAmount", "الرسوم"],
  ["foreignTxnFee", "رسوم المعاملة الأجنبية"],
  ["tax", "الضريبة"],
  ["shipping", "الشحن"],
  ["paidWithCrypto", "المدفوع بالعملة الرقمية"],
  ["paidWithFiat", "المدفوع نقدًا"],
  ["protectionEligibility", "أهلية الحماية"],
];

export const PROCESSOR_FIELDS: FieldDef[] = [
  ["responseCode", "كود استجابة المعالج"],
  ["declineCode", "كود الرفض"],
  ["declineReason", "سبب الرفض"],
  ["avsCode", "نتيجة AVS"],
  ["cvvCode", "نتيجة CVV"],
  ["paymentAdviceCode", "Payment Advice Code"],
  ["apiErrorCode", "كود خطأ الـ API"],
];

export const MERCHANT_FIELDS: FieldDef[] = [
  ["merchantName", "اسم التاجر"],
  ["mcc", "فئة التاجر (MCC)"],
  ["merchantLocation", "الموقع"],
  ["merchantWebsite", "الموقع الإلكتروني"],
  ["merchantEmail", "البريد الإلكتروني"],
  ["merchantDescription", "وصف التاجر"],
  ["terminalId", "معرّف الطرفية"],
  ["storeId", "معرّف المتجر"],
];

export function hasField(d: Record<string, unknown>, k: string) {
  return d[k] !== null && d[k] !== undefined && d[k] !== "";
}

const DATE_KEYS = new Set(["createdAt", "updatedAt", "txnCreate"]);

export function fmtFieldValue(key: string, value: unknown): string {
  const s = String(value ?? "").trim();
  if (!s) return "—";
  if (DATE_KEYS.has(key)) {
    const n = Number(s);
    if (Number.isFinite(n) && n > 1_000_000_000) return formatDateTime(n < 1e12 ? n * 1000 : n);
  }
  if (/^-?\d+(\.\d+)?$/.test(s) && s.includes(".")) {
    const n = Number(s);
    if (Number.isFinite(n)) {
      const abs = Math.abs(n);
      const digits = abs > 0 && abs < 0.01 ? 6 : 2;
      return n.toLocaleString("en-US", { maximumFractionDigits: digits });
    }
  }
  if (/^-?\d+(\.\d+)?[eE][-+]?\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return n === 0 ? "0" : n.toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  return s;
}

/**
 * Fee breakdown read from the transaction's own values — identical logic to the
 * account panel, so the monthly-spend figure matches the source row.
 */
export function txnFeeBreakdown(input: { amount?: unknown; detail?: Record<string, unknown> | null }) {
  const d = (input.detail ?? {}) as Record<string, unknown>;
  const abs = (v: unknown) => {
    const n = Number(v ?? NaN);
    return Number.isFinite(n) ? Math.abs(n) : null;
  };
  const total = abs(input.amount) ?? abs(d["basicAmount"]) ?? abs(d["grossAmount"]);
  const net = abs(d["transactionAmount"]) ?? abs(d["basicAmount"]);

  let fee: number | null = null;
  for (const k of ["foreignTxnFee", "feeAmount", "fee", "handlingFee"]) {
    const n = abs(d[k]);
    if (n) {
      fee = n;
      break;
    }
  }
  if (fee === null && total !== null && net !== null && total - net > 0.0049) fee = total - net;

  const spend = fee !== null && total !== null ? total - fee : (net ?? total);
  return { total, fee, spend };
}

export const TXN_SECTIONS: { title: string; defs: FieldDef[] }[] = [
  { title: "بيانات المعاملة الأساسية", defs: CORE_FIELDS },
  { title: "تفصيل العملة والرسوم", defs: AMOUNT_FIELDS },
  { title: "بيانات المعالج وسبب الرفض", defs: PROCESSOR_FIELDS },
  { title: "تفاصيل التاجر", defs: MERCHANT_FIELDS },
];
