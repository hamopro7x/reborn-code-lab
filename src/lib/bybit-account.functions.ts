import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAccess, assertAdmin, requiredId, validateApiCreds } from "./bybit-access";

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
  .inputValidator((input: { id: string; name?: string; monthlyCashback?: number; sortOrder?: number; frozen?: boolean; frozenUntil?: string | null }) => {
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
    const frozen = typeof input?.frozen === "boolean" ? input.frozen : undefined;
    let frozenUntil: string | null = null;
    if (input?.frozenUntil) {
      const t = new Date(String(input.frozenUntil));
      if (Number.isNaN(t.getTime()) || t.getTime() <= Date.now()) throw new Error("وقت انتهاء التجميد لازم يكون في المستقبل");
      frozenUntil = t.toISOString();
    }
    return { id, name, monthlyCashback, sortOrder, frozen, frozenUntil };
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
