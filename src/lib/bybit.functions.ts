import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accountInput, assertAccess, assertAdmin, requiredId, validateApiCreds } from "./bybit-access";

export const listBybitAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    return { accounts: await mod.listAccounts() };
  });

export const addBybitAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { apiKey: string; apiSecret: string; name?: string; force?: boolean }) => ({
    ...validateApiCreds(input),
    force: Boolean(input?.force),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    const errs = await import("./bybit-errors");
    try {
      const account = await mod.createAccount(data.apiKey, data.apiSecret, context.userId, data.name, data.force);
      return { ok: true as const, account };
    } catch (e) {
      const { code, message } = errs.normalizeBybitError(e);
      const ip = code === "IP_RESTRICTED" ? await mod.serverIp() : null;
      return { ok: false as const, error: message, errorCode: code, serverIp: ip };
    }
  });

export const removeBybitAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: requiredId(input, "معرف الحساب مطلوب") }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    await mod.deleteAccount(data.id);
    return { ok: true as const };
  });

export const updateBybitAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name?: string; monthlyCashback?: number; sortOrder?: number }) => {
    const id = requiredId(input, "معرف الحساب مطلوب");
    const name = input?.name !== undefined ? String(input.name).trim().slice(0, 60) : undefined;
    if (name !== undefined && !name) throw new Error("اسم الحساب مطلوب");
    let monthlyCashback: number | undefined;
    if (input?.monthlyCashback !== undefined && input.monthlyCashback !== null) {
      const n = Number(input.monthlyCashback);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("نسبة الاسترداد لازم تكون بين 0 و 100");
      monthlyCashback = Math.round(n * 100) / 100;
    }
    let sortOrder: number | undefined;
    if (input?.sortOrder !== undefined && input.sortOrder !== null) {
      const n = Math.trunc(Number(input.sortOrder));
      if (!Number.isFinite(n) || n < 1 || n > 9999) throw new Error("رقم الفيزا لازم يكون بين 1 و 9999");
      sortOrder = n;
    }
    return { id, name, monthlyCashback, sortOrder };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    await mod.updateAccount(data);
    return { ok: true as const };
  });

export const reorderBybitAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => {
    const ids = Array.isArray(input?.ids) ? input.ids.map((x) => String(x)).filter(Boolean) : [];
    if (!ids.length) throw new Error("ترتيب غير صالح");
    return { ids };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    await mod.reorderAccounts(data.ids);
    return { ok: true as const };
  });


export const getBybitOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    return mod.readOp(data.accountId, () => mod.fetchOverview(data.accountId), {} as any);
  });

export const getBybitCardTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId?: string; status?: string; page?: number; pageSize?: number }) => ({
    ...accountInput(input),
    status:
      input?.status === "success" || input?.status === "failed" || input?.status === "refund"
        ? (input.status as "success" | "failed" | "refund")
        : ("all" as const),
    page: Math.max(Number(input?.page ?? 1) || 1, 1),
    pageSize: Math.min(Math.max(Number(input?.pageSize ?? 150) || 150, 10), 500),
  }))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    // The visible table is a database archive, so reading it must not depend on
    // the account's current API key. A missing/restricted Bybit key previously
    // made readOp return an empty fallback even while thousands of archived
    // successful purchases were present.
    return mod.fetchCardTxnsPage({
      accountId: data.accountId,
      status: data.status,
      page: data.page,
      pageSize: data.pageSize,
    });
  });

export const syncBybitCardTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    return mod.readOp(data.accountId, () => mod.syncCardTxns(data.accountId), {
      added: 0,
      backfillDone: false,
    });
  });

export const getBybitOnChain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    return mod.readOp(data.accountId, () => mod.fetchOnChain(data.accountId), {
      deposits: [] as Awaited<ReturnType<typeof mod.fetchOnChain>>["deposits"],
      withdrawals: [] as Awaited<ReturnType<typeof mod.fetchOnChain>>["withdrawals"],
    });
  });

export const syncAllBybitCardTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    const errs = await import("./bybit-errors");
    try {
      return { ok: true as const, ...(await mod.syncAllCardTxns()) };
    } catch (e) {
      const { code, message } = errs.normalizeBybitError(e);
      return { ok: false as const, added: 0, accounts: 0, error: message, errorCode: code };
    }
  });

export const getBybitInternal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    return mod.readOp(data.accountId, () => mod.fetchInternal(data.accountId), {
      deposits: [] as Awaited<ReturnType<typeof mod.fetchInternal>>["deposits"],
      withdrawals: [] as Awaited<ReturnType<typeof mod.fetchInternal>>["withdrawals"],
    });
  });

export const getBybitApiStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
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
    return mod.readOp(data.accountId, async () => ({ rows: await mod.fetchP2P(data.accountId) }), {
      rows: [] as Awaited<ReturnType<typeof mod.fetchP2P>>,
    });
  });

export const saveBybitApiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { apiKey: string; apiSecret: string; name?: string }) => validateApiCreds(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    const errs = await import("./bybit-errors");
    try {
      await mod.testCreds({ key: data.apiKey, secret: data.apiSecret });
    } catch (e) {
      const { code, message } = errs.normalizeBybitError(e);
      return { ok: false as const, error: message, errorCode: code };
    }
    await mod.saveCreds(data.apiKey, data.apiSecret, context.userId);
    return { ok: true as const };
  });

export const deleteBybitApiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
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
    return mod.readOp(data.accountId, async () => ({ cards: await mod.fetchCards(data.accountId) }), {
      cards: [] as Awaited<ReturnType<typeof mod.fetchCards>>,
    });
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
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    await mod.createCard({ ...data, userId: context.userId });
    return { ok: true as const };
  });

export const deleteBybitCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: requiredId(input, "معرف البطاقة مطلوب") }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    await mod.deleteCard(data.id);
    return { ok: true as const };
  });

export const updateBybitCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; pan4: string; brand: string; currency: string; status: string; name?: string; fullNumber?: string; cvv?: string; expiry?: string }) => ({
    id: requiredId(input, "معرف البطاقة مطلوب"),
    pan4: String(input?.pan4 ?? "").trim(),
    brand: String(input?.brand ?? "Visa").trim(),
    currency: String(input?.currency ?? "USD").trim().toUpperCase(),
    status: String(input?.status ?? "active").trim(),
    name: input?.name ? String(input.name).trim() : undefined,
    fullNumber: input?.fullNumber ? String(input.fullNumber).trim() : undefined,
    cvv: input?.cvv ? String(input.cvv).trim() : undefined,
    expiry: input?.expiry ? String(input.expiry).trim() : undefined,
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
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
    await assertAdmin(context.supabase, context.userId);
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

export const getBybitLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { group?: string; status?: string; accountId?: string; page?: number; pageSize?: number }) => ({
    group: input?.group ? String(input.group).slice(0, 30) : "txns",
    status: input?.status ? String(input.status).slice(0, 30) : "all",
    accountId: input?.accountId ? String(input.accountId) : undefined,
    page: Math.max(Number(input?.page ?? 1) || 1, 1),
    pageSize: Math.min(Math.max(Number(input?.pageSize ?? 50) || 50, 10), 200),
  }))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    return mod.fetchLedgerPage(data);
  });

export const syncBybitLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    try {
      return { ok: true as const, ...(await mod.syncAllLedger()) };
    } catch (e) {
      const errs = await import("./bybit-errors");
      const { message, code } = errs.normalizeBybitError(e);
      return { ok: false as const, saved: 0, accounts: 0, error: message, errorCode: code };
    }
  });

export const getBybitSpendTotals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    return mod.computeSpendAllAccounts();
  });

/** Reference map pan4 -> card brand, read straight from the main account cards. */
export const getBybitCardBrands = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    return { brands: await mod.cardBrandsByPan() };
  });
