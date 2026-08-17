/**
 * Single source of truth for every Bybit failure surfaced in "معاملات الفيزا".
 * Pure + client-safe: the server normalizes errors with it, the UI renders them.
 * Any new account/API automatically inherits the same messages and codes.
 */
export type BybitErrorCode =
  | "NOT_CONFIGURED"
  | "ACCOUNT_KEYS_MISSING"
  | "BAD_KEY"
  | "NO_PERMISSION"
  | "IP_RESTRICTED"
  | "RATE_LIMITED"
  | "NETWORK"
  | "UNSUPPORTED"
  | "UNKNOWN";

export type BybitError = { code: BybitErrorCode; message: string; raw: string };

const RULES: Array<{ code: BybitErrorCode; test: RegExp; message: string }> = [
  {
    code: "ACCOUNT_KEYS_MISSING",
    test: /BYBIT_ACCOUNT_KEYS_MISSING/,
    message: "لا توجد مفاتيح API محفوظة لهذا الحساب. أضِف مفتاح API الخاص به من قسم «مفتاح API».",
  },
  {
    code: "NOT_CONFIGURED",
    test: /BYBIT_NOT_CONFIGURED/,
    message: "لم يتم ربط مفاتيح Bybit بعد.",
  },
  {
    code: "NO_PERMISSION",
    test: /\b10005\b|permission denied|Unauthorized/i,
    message:
      "المفتاح صحيح لكن بدون صلاحيات القراءة المطلوبة. من Bybit → API Management فعّل: Unified Trading (Read) + Assets (Read) + Wallet + Exchange/Card.",
  },
  {
    code: "BAD_KEY",
    test: /\b10003\b|\b10004\b|api_key|invalid api/i,
    message: "مفتاح API أو السر غير صحيح (انسخهما كاملين بدون مسافات).",
  },
  {
    code: "IP_RESTRICTED",
    test: /\b10010\b|unmatched ip/i,
    message: "المفتاح مقيّد بعنوان IP. اجعله «Unrestricted» من إعدادات المفتاح في Bybit.",
  },
  {
    code: "RATE_LIMITED",
    test: /\b10006\b|\b10016\b|HTTP 429|too many/i,
    message: "Bybit يحدّ من عدد الطلبات مؤقتًا. حاول التحديث بعد لحظات.",
  },
  {
    code: "NETWORK",
    test: /Abort|timeout|timed out|fetch failed|ECONNRESET|network|HTTP 5\d\d/i,
    message: "تعذّر الوصول إلى Bybit (مشكلة شبكة مؤقتة). أعد المحاولة.",
  },
  {
    code: "UNSUPPORTED",
    test: /\b10001\b|not supported|not exist/i,
    message: "هذه الخدمة غير متاحة لهذا الحساب على Bybit.",
  },
];

export function normalizeBybitError(e: unknown): BybitError {
  const raw = String((e as any)?.message ?? e ?? "").slice(0, 400);
  for (const rule of RULES) {
    if (rule.test.test(raw)) return { code: rule.code, message: rule.message, raw };
  }
  return { code: "UNKNOWN", message: raw || "فشل غير معروف من Bybit", raw };
}

export function bybitErrorMessage(e: unknown): string {
  return normalizeBybitError(e).message;
}
