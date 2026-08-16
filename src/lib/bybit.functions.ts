import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAccess(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (roles.includes("admin")) return "admin" as const;
  if (roles.includes("employee")) return "employee" as const;
  throw new Error("Forbidden");
}

const accountInput = (input: any) => ({ accountId: input?.accountId ? String(input.accountId) : undefined });

export const listBybitAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    return { accounts: await mod.listAccounts() };
  });

export const addBybitAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { apiKey: string; apiSecret: string; name?: string; force?: boolean }) => {
    const apiKey = String(input?.apiKey ?? "").trim();
    const apiSecret = String(input?.apiSecret ?? "").trim();
    const name = String(input?.name ?? "").trim().slice(0, 60);
    if (apiKey.length < 8 || apiKey.length > 200) throw new Error("مفتاح API غير صالح");
    if (apiSecret.length < 8 || apiSecret.length > 400) throw new Error("السر غير صالح");
    return { apiKey, apiSecret, name, force: Boolean(input?.force) };
  })
  .handler(async ({ data, context }) => {
    const role = await assertAccess(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const mod = await import("./bybit.server");
    try {
      const account = await mod.createAccount(data.apiKey, data.apiSecret, context.userId, data.name, data.force);
      return { ok: true as const, account };
    } catch (e: any) {
      const message = String(e?.message ?? e);
      const ip = message.includes("IP") ? await mod.serverIp() : null;
      return { ok: false as const, error: message, serverIp: ip };
    }
  });

export const removeBybitAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    const id = String(input?.id ?? "").trim();
    if (!id) throw new Error("معرف الحساب مطلوب");
    return { id };
  })
  .handler(async ({ data, context }) => {
    const role = await assertAccess(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const mod = await import("./bybit.server");
    await mod.deleteAccount(data.id);
    return { ok: true as const };
  });

export const getBybitOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    if (!(await mod.bybitConfigured(data.accountId))) return { configured: false as const };
    try {
      return { configured: true as const, ...(await mod.fetchOverview(data.accountId)) };
    } catch (e: any) {
      return { configured: true as const, failed: String(e?.message ?? e) };
    }
  });

export const getBybitCardTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    if (!(await mod.bybitConfigured(data.accountId))) return { configured: false as const, rows: [] };
    try {
      return { configured: true as const, rows: await mod.fetchCardTxns(10_000, data.accountId) };
    } catch (e: any) {
      return { configured: true as const, rows: [], failed: String(e?.message ?? e) };
    }
  });

export const syncBybitCardTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    if (!(await mod.bybitConfigured(data.accountId))) return { configured: false as const, added: 0 };
    try {
      return { configured: true as const, ...(await mod.syncCardTxns(data.accountId)) };
    } catch (e: any) {
      return { configured: true as const, added: 0, failed: String(e?.message ?? e) };
    }
  });

export const getBybitOnChain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    if (!(await mod.bybitConfigured(data.accountId))) return { configured: false as const, deposits: [], withdrawals: [] };
    try {
      return { configured: true as const, ...(await mod.fetchOnChain(data.accountId)) };
    } catch (e: any) {
      return { configured: true as const, deposits: [], withdrawals: [], failed: String(e?.message ?? e) };
    }
  });

export const syncAllBybitCardTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    try {
      return { ok: true as const, ...(await mod.syncAllCardTxns()) };
    } catch (e: any) {
      return { ok: false as const, added: 0, accounts: 0, error: String(e?.message ?? e) };
    }
  });

export const getBybitInternal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    if (!(await mod.bybitConfigured(data.accountId))) return { configured: false as const, deposits: [], withdrawals: [] };
    try {
      return { configured: true as const, ...(await mod.fetchInternal(data.accountId)) };
    } catch (e: any) {
      return { configured: true as const, deposits: [], withdrawals: [], failed: String(e?.message ?? e) };
    }
  });

export const getBybitApiStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await assertAccess(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const mod = await import("./bybit.server");
    if (!(await mod.bybitConfigured())) return { configured: false as const, maskedKey: "" };
    const { key } = await mod.getCreds();
    return { configured: true as const, maskedKey: `${key.slice(0, 4)}••••${key.slice(-4)}` };
  });

export const getBybitP2P = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    if (!(await mod.bybitConfigured(data.accountId))) return { configured: false as const, rows: [] };
    try {
      return { configured: true as const, rows: await mod.fetchP2P(data.accountId) };
    } catch (e: any) {
      return { configured: true as const, rows: [], failed: String(e?.message ?? e) };
    }
  });

export const saveBybitApiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { apiKey: string; apiSecret: string; name?: string }) => {
    const apiKey = String(input?.apiKey ?? "").trim();
    const apiSecret = String(input?.apiSecret ?? "").trim();
    const name = String(input?.name ?? "").trim().slice(0, 60);
    if (apiKey.length < 8 || apiKey.length > 200) throw new Error("مفتاح API غير صالح");
    if (apiSecret.length < 8 || apiSecret.length > 400) throw new Error("السر غير صالح");
    return { apiKey, apiSecret, name };
  })
  .handler(async ({ data, context }) => {
    const role = await assertAccess(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const mod = await import("./bybit.server");
    try {
      await mod.testCreds({ key: data.apiKey, secret: data.apiSecret });
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message ?? e) };
    }
    await mod.saveCreds(data.apiKey, data.apiSecret, context.userId);
    return { ok: true as const };
  });

export const deleteBybitApiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await assertAccess(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const mod = await import("./bybit.server");
    await mod.clearCreds();
    return { ok: true as const };
  });

export const getBybitCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    if (!(await mod.bybitConfigured(data.accountId))) return { configured: false as const, cards: [] };
    try {
      return { configured: true as const, cards: await mod.fetchCards(data.accountId) };
    } catch (e: any) {
      return { configured: true as const, cards: [], failed: String(e?.message ?? e) };
    }
  });

export const createBybitCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pan4: string; brand: string; currency: string; status: string; name?: string; fullNumber?: string; cvv?: string; expiry?: string; accountId?: string }) => {
    const pan4 = String(input?.pan4 ?? "").trim();
    if (!pan4 || pan4.length < 3) throw new Error("آخر 4 أرقام مطلوبة");
    return {
      pan4,
      brand: String(input?.brand ?? "Visa").trim(),
      currency: String(input?.currency ?? "USD").trim().toUpperCase(),
      status: String(input?.status ?? "active").trim(),
      name: input?.name ? String(input.name).trim() : undefined,
      fullNumber: input?.fullNumber ? String(input.fullNumber).trim() : undefined,
      cvv: input?.cvv ? String(input.cvv).trim() : undefined,
      expiry: input?.expiry ? String(input.expiry).trim() : undefined,
      accountId: input?.accountId ? String(input.accountId) : undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const role = await assertAccess(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const mod = await import("./bybit.server");
    await mod.createCard({ ...data, userId: context.userId });
    return { ok: true as const };
  });

export const deleteBybitCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    const id = String(input?.id ?? "").trim();
    if (!id) throw new Error("معرف البطاقة مطلوب");
    return { id };
  })
  .handler(async ({ data, context }) => {
    const role = await assertAccess(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const mod = await import("./bybit.server");
    await mod.deleteCard(data.id);
    return { ok: true as const };
  });

export const updateBybitCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; pan4: string; brand: string; currency: string; status: string; name?: string; fullNumber?: string; cvv?: string; expiry?: string }) => {
    const id = String(input?.id ?? "").trim();
    if (!id) throw new Error("معرف البطاقة مطلوب");
    return {
      id,
      pan4: String(input?.pan4 ?? "").trim(),
      brand: String(input?.brand ?? "Visa").trim(),
      currency: String(input?.currency ?? "USD").trim().toUpperCase(),
      status: String(input?.status ?? "active").trim(),
      name: input?.name ? String(input.name).trim() : undefined,
      fullNumber: input?.fullNumber ? String(input.fullNumber).trim() : undefined,
      cvv: input?.cvv ? String(input.cvv).trim() : undefined,
      expiry: input?.expiry ? String(input.expiry).trim() : undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const role = await assertAccess(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const mod = await import("./bybit.server");
    await mod.updateCard(data);
    return { ok: true as const };
  });

export const getBybitAccountInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) => {
    const role = await assertAccess(context.supabase, context.userId);
    // RLS on bybit_account_info is admin-only; employees are allowed read-only
    // access here after the role check above.
    const db =
      role === "admin"
        ? context.supabase
        : (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    let q = (db as any).from("bybit_account_info").select("*");
    if (data.accountId) q = q.eq("account_id", data.accountId);
    const { data: row } = await q.order("created_at", { ascending: true }).limit(1).maybeSingle();
    return { info: row ?? null };
  });

export const saveBybitAccountInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; accountId?: string; email?: string; phone?: string; password?: string; bonus?: string; mfa_code?: string }) => ({
    id: input?.id ? String(input.id) : undefined,
    accountId: input?.accountId ? String(input.accountId) : undefined,
    email: String(input?.email ?? "").trim(),
    phone: String(input?.phone ?? "").trim(),
    password: String(input?.password ?? "").trim(),
    bonus: String(input?.bonus ?? "").trim(),
    mfa_code: String(input?.mfa_code ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    const role = await assertAccess(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const payload = {
      email: data.email,
      phone: data.phone,
      password: data.password,
      bonus: data.bonus,
      mfa_code: data.mfa_code,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await context.supabase.from("bybit_account_info").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("bybit_account_info")
        .insert({ ...payload, created_by: context.userId, account_id: data.accountId ?? null });
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

/* ============================ Convert (تحويل عملة) ============================ */

export const getBybitConvertCoins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId?: string; coin?: string }) => ({
    accountId: input?.accountId ? String(input.accountId) : undefined,
    coin: input?.coin ? String(input.coin).toUpperCase().slice(0, 20) : undefined,
  }))
  .handler(async ({ data, context }) => {
    const role = await assertAccess(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const mod = await import("./bybit.server");
    try {
      return { ok: true as const, coins: await mod.convertCoinList(data.accountId, data.coin) };
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message ?? e), coins: [] };
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
    const role = await assertAccess(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const mod = await import("./bybit.server");
    try {
      return { ok: true as const, quote: await mod.convertQuote(data) };
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message ?? e) };
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
    const role = await assertAccess(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const mod = await import("./bybit.server");
    try {
      await mod.convertExecute(data.quoteTxId, data.accountId);
      await new Promise((r) => setTimeout(r, 1200));
      const status = await mod.convertStatus(data.quoteTxId, data.accountId);
      return { ok: true as const, ...status };
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message ?? e) };
    }
  });
