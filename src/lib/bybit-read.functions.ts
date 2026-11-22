import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accountInput, assertAdmin } from "./bybit-access";

export const getBybitOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    return mod.readOp(data.accountId, () => mod.fetchOverview(data.accountId), {} as any);
  });

export const getBybitCardTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId?: string; status?: string; page?: number; pageSize?: number }) => ({
    ...accountInput(input),
    status:
      input?.status === "success" || input?.status === "failed" || input?.status === "refund" || input?.status === "review"
        ? (input.status as "success" | "failed" | "refund" | "review")
        : ("all" as const),
    page: Math.max(Number(input?.page ?? 1) || 1, 1),
    pageSize: Math.min(Math.max(Number(input?.pageSize ?? 150) || 150, 10), 500),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const hideReversed = false;
    const mod = await import("./bybit.server");
    // The visible table is a database archive, so reading it must not depend on
    // the account's current API key. A missing/restricted Bybit key previously
    // made readOp return an empty fallback even while thousands of archived
    // successful purchases were present.
    const archived = await mod.fetchCardTxnsPage({
      accountId: data.accountId,
      status: data.status,
      page: data.page,
      pageSize: data.pageSize,
      hideReversed,
    });
    // Monthly cycles empty the archive of each account at the cycle boundary.
    // Until that account's own sync has written the new cycle, read it live from
    // Bybit so a funded account never renders as "no transactions".
    if (!archived.total && data.page === 1) {
      try {
        // One live request is enough: it returns the rows immediately and also
        // archives them under this exact account. The previous sync + re-read +
        // second live request could hit Bybit three times, get rate-limited and
        // replace visible rows with an empty archive on the next refresh.
        return await mod.fetchCardTxnsLive({
          accountId: data.accountId,
          status: data.status,
          page: data.page,
          pageSize: data.pageSize,
          hideReversed,
        });
      } catch (e) {
        console.error("live card txns fallback failed:", (e as Error)?.message);
      }
    }
    return archived;
  });

export const syncBybitCardTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./bybit.server");
    const res = await mod.readOp(data.accountId, () => mod.syncCardTxns(data.accountId), {
      added: 0,
      backfillDone: false,
    });
    // Card persistence already mirrors the stored truth into the ledger.
    // Do not repeat a full archive scan and wait for transfer APIs here.
    return res;
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
      // Fast sync (newest rows of every account) so the screen updates in
      // seconds; the full month walk is scheduled in the background.
      const recent = await mod.syncAllRecent();
      mod.runDeepSyncIfDue();
      return { ok: true as const, added: recent.saved, accounts: recent.accounts, saved: recent.saved };
    } catch (e) {
      const { code, message } = errs.normalizeBybitError(e);
      return { ok: false as const, added: 0, accounts: 0, saved: 0, error: message, errorCode: code };
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
    const { getCreds } = await import("./bybit-account.server");
    const { key } = await getCreds();
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
