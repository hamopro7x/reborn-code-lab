import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./bybit-access";

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
    await assertAdmin(context.supabase, context.userId);
    // Reads enforce the effective cycle themselves. Cleanup runs in the deep
    // sync; never block a visible page on destructive maintenance work.
    const mod = await import("./bybit.server");
    if (data.page === 1) await mod.pullFromBybit();
    return mod.fetchLedgerPage({ ...data, hideReversed: false });
  });

export const syncBybitLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    try {
      const recent = await mod.syncAllRecent();
      mod.runDeepSyncIfDue();
      return { ok: true as const, ...recent };
    } catch (e) {
      const errs = await import("./bybit-errors");
      const { message, code } = errs.normalizeBybitError(e);
      return { ok: false as const, saved: 0, accounts: 0, error: message, errorCode: code };
    }
  });

export const getBybitSpendTotals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    return mod.computeSpendAllAccounts();
  });

/** Reference map pan4 -> card brand, read straight from the main account cards. */
export const getBybitCardBrands = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    return { brands: await mod.cardBrandsByPan() };
  });

export const getBybitReversalCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    return mod.listReversalCases();
  });

export const resolveBybitReversalCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId: string; eventId: string; targetId: string | null; candidates: string[] }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input?.accountId ?? "") || !/^(legacy:)?[\w-]{1,200}$/.test(input?.eventId ?? "")) throw new Error("معرف غير صالح");
    if (!Array.isArray(input.candidates) || input.candidates.length > 100 || input.candidates.some((id) => !/^[\w-]{1,200}$/.test(id))) throw new Error("مرشحون غير صالحين");
    if (input.targetId !== null && !input.candidates.includes(input.targetId)) throw new Error("اختيار غير صالح");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    // User-scoped RPC rechecks auth.uid() and admin in the same transaction.
    const { error } = await (context.supabase as any).rpc("bybit_resolve_case", {
      p_account: data.accountId, p_event: data.eventId, p_target: data.targetId,
      p_expected: data.candidates, p_source: "admin-review",
    });
    if (error) throw new Error(error.message);
    const mod = await import("./bybit.server");
    mod.clearBybitSpendCache();
    return { ok: true };
  });
