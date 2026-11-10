/**
 * Pure OKX helpers (no network, no database) so the rules are testable:
 * request signing, status labels, record → row mapping and error messages.
 */
import { createHmac } from "crypto";

export type OkxCreds = { key: string; secret: string; passphrase: string };

export type OkxAssetRow = {
  id: string;
  coin: string;
  chain: string;
  amount: number;
  fee: number;
  status: string;
  time: number;
  address: string;
  txId: string;
  direction: "in" | "out";
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** OK-ACCESS-SIGN = Base64(HMAC-SHA256(timestamp + METHOD + requestPath + body, secret)). */
export function okxSign(secret: string, timestamp: string, method: string, requestPath: string, body = ""): string {
  return createHmac("sha256", secret).update(timestamp + method.toUpperCase() + requestPath + body).digest("base64");
}

/** Secret + passphrase share the existing encrypted key slot as one JSON value. */
export function encodeOkxSecret(secret: string, passphrase: string): string {
  return JSON.stringify({ okx: 1, secret, passphrase });
}

export function decodeOkxSecret(stored: string | null | undefined): { secret: string; passphrase: string } | null {
  if (!stored) return null;
  try {
    const v = JSON.parse(stored);
    if (v && v.okx === 1 && typeof v.secret === "string" && typeof v.passphrase === "string") {
      return { secret: v.secret, passphrase: v.passphrase };
    }
  } catch {
    /* not an OKX value */
  }
  return null;
}

/** Withdrawal states: 2 success, -1 failed, -2 canceled; everything else is still in progress. */
export function okxWithdrawStatus(state: unknown): string {
  const s = String(state ?? "").trim();
  if (s === "2") return "ناجحة";
  if (s === "-1") return "فاشلة";
  if (s === "-2") return "ملغاة";
  return "قيد التنفيذ";
}

/** Deposit states: 1 credited / 2 successful; blocked states are failures; the rest is pending. */
export function okxDepositStatus(state: unknown): string {
  const s = String(state ?? "").trim();
  if (s === "1" || s === "2") return "ناجحة";
  if (s === "11" || s === "12" || s === "13" || s === "14") return "فاشلة";
  return "قيد التنفيذ";
}

export const OKX_INTERNAL_CHAIN = "التحويل الداخلي";

export function mapOkxDeposit(d: any, internal: boolean): OkxAssetRow {
  return {
    id: String(d?.depId ?? d?.txId ?? ""),
    coin: String(d?.ccy ?? ""),
    chain: internal ? OKX_INTERNAL_CHAIN : String(d?.chain ?? ""),
    amount: Math.abs(num(d?.amt)),
    fee: 0,
    status: okxDepositStatus(d?.state),
    time: Number(d?.ts ?? 0),
    address: String((internal ? d?.from : d?.to || d?.from) ?? ""),
    txId: String(d?.txId ?? ""),
    direction: "in",
  };
}

export function mapOkxWithdrawal(w: any, internal: boolean): OkxAssetRow {
  return {
    id: String(w?.wdId ?? w?.txId ?? ""),
    coin: String(w?.ccy ?? ""),
    chain: internal ? OKX_INTERNAL_CHAIN : String(w?.chain ?? ""),
    amount: -Math.abs(num(w?.amt)),
    fee: Math.abs(num(w?.fee)),
    status: okxWithdrawStatus(w?.state),
    time: Number(w?.ts ?? 0),
    address: String(w?.to ?? ""),
    txId: String(w?.txId ?? ""),
    direction: "out",
  };
}

export class OkxError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Arabic, user-facing explanation of an OKX error code. */
export function okxErrorMessage(code: string, raw = ""): string {
  switch (code) {
    case "50105":
      return "الـ Passphrase غلط — اكتبها بالظبط زي ما عملتها وقت إنشاء المفتاح.";
    case "50111":
    case "50119":
    case "50100":
      return "مفتاح API مش صحيح أو اتمسح من OKX.";
    case "50113":
    case "50114":
      return "السر (Secret Key) مش صحيح.";
    case "50110":
      return "عنوان السيرفر مش مضاف في قائمة الـ IP المسموحة للمفتاح على OKX.";
    case "50102":
      return "توقيت السيرفر مختلف عن OKX، حاول تاني بعد شوية.";
    case "50120":
    case "50030":
      return "المفتاح ملوش صلاحية القراءة (Read).";
    case "50011":
    case "50061":
      return "طلبات كتير على OKX في نفس الوقت، هتتعاد لوحدها.";
    case "OKX_SETUP_MISSING":
      return "لازم تشغّل ملف قاعدة البيانات الخاص بـ OKX الأول (okx_accounts.sql).";
    case "OKX_KEYS_MISSING":
      return "مفاتيح الحساب ده مش موجودة.";
    default:
      return raw ? `خطأ من OKX: ${raw}` : "تعذر الاتصال بـ OKX.";
  }
}
