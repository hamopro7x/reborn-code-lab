import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAccess, assertAdmin, requiredId } from "./bybit-access";

function errorText(e: unknown) {
  const code = String((e as any)?.code ?? "");
  const raw = String((e as any)?.message ?? "");
  return { code, raw };
}

export const listOkxAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./okx.server");
    return { accounts: await mod.listOkxAccounts() };
  });

export const addOkxAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { apiKey: string; apiSecret: string; passphrase: string; name?: string }) => {
    const apiKey = String(input?.apiKey ?? "").trim();
    const apiSecret = String(input?.apiSecret ?? "").trim();
    const passphrase = String(input?.passphrase ?? "");
    const name = String(input?.name ?? "").trim().slice(0, 60);
    if (apiKey.length < 8 || apiKey.length > 200) throw new Error("مفتاح API غير صالح");
    if (apiSecret.length < 8 || apiSecret.length > 400) throw new Error("السر غير صالح");
    if (!passphrase || passphrase.length > 100) throw new Error("الـ Passphrase مطلوبة");
    return { apiKey, apiSecret, passphrase, name };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./okx.server");
    const core = await import("./okx-core");
    try {
      const account = await mod.createOkxAccount({
        key: data.apiKey,
        secret: data.apiSecret,
        passphrase: data.passphrase,
        userId: context.userId,
        name: data.name,
      });
      void mod.syncAllOkx(true).catch(() => undefined);
      return { ok: true as const, account };
    } catch (e) {
      const { code, raw } = errorText(e);
      const bybit = await import("./bybit.server");
      const ip = code === "50110" ? await bybit.serverIp() : null;
      return { ok: false as const, error: core.okxErrorMessage(code, raw), errorCode: code, serverIp: ip };
    }
  });

export const removeOkxAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: requiredId(input, "معرف الحساب مطلوب") }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./okx.server");
    await mod.deleteOkxAccount(data.id);
    return { ok: true as const };
  });

export const renameOkxAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name: string }) => {
    const id = requiredId(input, "معرف الحساب مطلوب");
    const name = String(input?.name ?? "").trim().slice(0, 60);
    if (!name) throw new Error("اسم الحساب مطلوب");
    return { id, name };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./okx.server");
    await mod.renameOkxAccount(data.id, data.name);
    return { ok: true as const };
  });

export const getOkxBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId: string }) => ({ accountId: requiredId({ id: input?.accountId }, "معرف الحساب مطلوب") }))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./okx.server");
    const core = await import("./okx-core");
    try {
      return { ...(await mod.fetchOkxBalances(data.accountId)), failed: null as string | null };
    } catch (e) {
      const { code, raw } = errorText(e);
      return { coins: [], totalUsd: 0, failed: core.okxErrorMessage(code, raw) };
    }
  });

export const getOkxMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId: string }) => ({ accountId: requiredId({ id: input?.accountId }, "معرف الحساب مطلوب") }))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./okx.server");
    const core = await import("./okx-core");
    const empty = { deposits: [], withdrawals: [] };
    try {
      const m = await mod.fetchOkxMovements(data.accountId, true);
      // Same rows go to the central ledger right away (idempotent, only changes are written).
      const bybit = await import("./bybit.server");
      void bybit.saveLedgerRows(mod.okxLedgerRows(data.accountId, m)).catch(() => undefined);
      return { ...m, failed: null as string | null };
    } catch (e) {
      const { code, raw } = errorText(e);
      return { internal: empty, onchain: empty, failed: core.okxErrorMessage(code, raw) };
    }
  });
