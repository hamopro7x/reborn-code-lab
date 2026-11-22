import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./bybit-access";

export const getBybitConvertCoins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId?: string; coin?: string }) => ({
    accountId: input?.accountId ? String(input.accountId) : undefined,
    coin: input?.coin ? String(input.coin).toUpperCase().slice(0, 20) : undefined,
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    const errs = await import("./bybit-errors");
    try {
      return { ok: true as const, coins: await mod.convertCoinList(data.accountId, data.coin) };
    } catch (e) {
      const { code, message } = errs.normalizeBybitError(e);
      return { ok: false as const, error: message, errorCode: code, coins: [] };
    }
  });

export const createBybitConvertQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId?: string; fromCoin: string; toCoin: string; amount: string }) => {
    const fromCoin = String(input?.fromCoin ?? "").trim().toUpperCase();
    const toCoin = String(input?.toCoin ?? "").trim().toUpperCase();
    const amount = String(input?.amount ?? "").trim();
    if (!fromCoin || !toCoin) throw new Error("اختر العملتين");
    if (fromCoin === toCoin) throw new Error("لا يمكن التحويل لنفس العملة");
    if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) throw new Error("أدخل كمية صحيحة");
    return { accountId: input?.accountId ? String(input.accountId) : undefined, fromCoin, toCoin, amount };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    const errs = await import("./bybit-errors");
    try {
      return { ok: true as const, quote: await mod.convertQuote(data) };
    } catch (e) {
      const { code, message } = errs.normalizeBybitError(e);
      return { ok: false as const, error: message, errorCode: code };
    }
  });

export const confirmBybitConvert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId?: string; quoteTxId: string }) => {
    const quoteTxId = String(input?.quoteTxId ?? "").trim();
    if (!quoteTxId) throw new Error("عرض السعر غير صالح");
    return { accountId: input?.accountId ? String(input.accountId) : undefined, quoteTxId };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    const errs = await import("./bybit-errors");
    try {
      await mod.convertExecute(data.quoteTxId, data.accountId);
      await new Promise((r) => setTimeout(r, 1200));
      const status = await mod.convertStatus(data.quoteTxId, data.accountId);
      return { ok: true as const, ...status };
    } catch (e) {
      const { code, message } = errs.normalizeBybitError(e);
      return { ok: false as const, error: message, errorCode: code };
    }
  });

/* ============================ السجل المركزي للمعاملات ============================ */
