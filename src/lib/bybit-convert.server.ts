/**
 * Bybit Convert quote and execution API operations.
 * Kept separate from card/ledger synchronization to isolate conversion flows.
 */
import { call, getCreds, type Creds } from "./bybit-account.server";
import { num } from "./bybit-runtime";

const CONVERT_ACCOUNTS = ["eb_convert_funding", "eb_convert_uta", "eb_convert_spot"] as const;

function convertError(e: unknown): Error {
  const msg = String((e as any)?.message ?? e);
  if (msg.includes("10005")) {
    return new Error(
      "مفتاح API ناقصه صلاحية التداول الفوري. من Bybit → API Management → عدّل المفتاح وفعّل «تداول موحّد – تداول» (Unified Trading → Trade / Spot) بالإضافة إلى «تبادل» (Exchange)، ثم احفظ وأعد المحاولة. صلاحية «سجل عمليات تبادل الأصول» وحدها لا تكفي للتحويل.",
    );
  }
  return e instanceof Error ? e : new Error(msg);
}

/** Bybit's convert account type differs per key/account; try the known ones. */
async function convertCall(
  method: "GET" | "POST",
  path: string,
  params: Record<string, unknown>,
  creds: Creds,
) {
  let last: unknown = null;
  for (const accountType of CONVERT_ACCOUNTS) {
    try {
      return await call(method, path, { ...params, accountType }, creds);
    } catch (e) {
      last = e;
      const msg = String((e as any)?.message ?? e);
      // permission / unsupported account type → try the next one
      if (!msg.includes("10005") && !msg.includes("181") && !msg.includes("params error")) throw convertError(e);
    }
  }
  throw convertError(last);
}

export type ConvertCoin = { coin: string; balance: number; toCoins: string[] };

export async function convertCoinList(accountId?: string, coin?: string): Promise<ConvertCoin[]> {
  const creds = await getCreds(accountId);
  const params: Record<string, unknown> = {};
  if (coin) { params["coin"] = coin; params["side"] = 1; }
  const res = await convertCall("GET", "/v5/asset/exchange/query-coin-list", params, creds);
  const rows = Array.isArray(res?.coins) ? res.coins : [];
  return rows.map((r: any) => ({
    coin: String(r?.coin ?? ""),
    balance: num(r?.balance),
    toCoins: Array.isArray(r?.toCoins) ? r.toCoins.map((c: any) => String(c)) : [],
  })).filter((r: ConvertCoin) => r.coin);
}

export type ConvertQuote = {
  quoteTxId: string;
  fromCoin: string;
  toCoin: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
  expiredTime: number;
};

export async function convertQuote(input: {
  accountId?: string; fromCoin: string; toCoin: string; amount: string;
}): Promise<ConvertQuote> {
  const creds = await getCreds(input.accountId);
  const res = await convertCall("POST", "/v5/asset/exchange/quote-apply", {
    fromCoin: input.fromCoin,
    toCoin: input.toCoin,
    requestCoin: input.fromCoin,
    requestAmount: input.amount,
  }, creds);
  const r = (res as any)?.result ?? res;
  const fromAmount = num(r?.fromAmount) || Number(input.amount) || 0;
  const toAmount = num(r?.toAmount);
  const rate = num(r?.exchangeRate) || (fromAmount > 0 && toAmount > 0 ? toAmount / fromAmount : 0);
  return {
    quoteTxId: String(r?.quoteTxId ?? ""),
    fromCoin: String(r?.fromCoin ?? input.fromCoin),
    toCoin: String(r?.toCoin ?? input.toCoin),
    fromAmount,
    toAmount,
    rate,
    expiredTime: Number(r?.expiredTime ?? 0) || 0,
  };
}

export async function convertExecute(quoteTxId: string, accountId?: string) {
  const creds = await getCreds(accountId);
  let res: any;
  try {
    res = await call("POST", "/v5/asset/exchange/convert-execute", { quoteTxId }, creds);
  } catch (e) {
    throw convertError(e);
  }
  return { quoteTxId: String(res?.quoteTxId ?? quoteTxId), status: String(res?.exchangeStatus ?? "init") };
}

export async function convertStatus(quoteTxId: string, accountId?: string) {
  const creds = await getCreds(accountId);
  const res = await convertCall("GET", "/v5/asset/exchange/convert-result-query", { quoteTxId }, creds);
  const r = res?.result ?? res;
  return {
    status: String(r?.exchangeStatus ?? "init"),
    fromCoin: String(r?.fromCoin ?? ""),
    toCoin: String(r?.toCoin ?? ""),
    fromAmount: num(r?.fromAmount),
    toAmount: num(r?.toAmount),
  };
}

/* ============================ السجل المركزي للمعاملات ============================ */
