import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accountInput, assertAccess, assertAdmin, requiredId, validateApiCreds } from "./bybit-access";

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
    // Account login details are admin-only.
    await assertAdmin(context.supabase, context.userId);
    const db = context.supabase;
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
