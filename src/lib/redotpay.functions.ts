import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("admin")) throw new Error("Forbidden");
}

export const redotpayStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./redotpay.server");
    const creds = await mod.getCreds();
    return { connected: Boolean(creds), keyPreview: creds ? `${creds.key.slice(0, 6)}••••${creds.key.slice(-4)}` : null };
  });

export const redotpayConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { apiKey: string; apiSecret: string; force?: boolean }) => {
    const apiKey = String(input?.apiKey ?? "").trim();
    const apiSecret = String(input?.apiSecret ?? "").trim();
    if (apiKey.length < 8 || apiKey.length > 200) throw new Error("مفتاح API غير صالح");
    if (apiSecret.length < 8 || apiSecret.length > 400) throw new Error("السر غير صالح");
    return { apiKey, apiSecret, force: Boolean(input?.force) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./redotpay.server");
    if (!data.force) {
      try {
        await mod.testCreds({ key: data.apiKey, secret: data.apiSecret });
      } catch (e: any) {
        const message = String(e?.message ?? e);
        return { ok: false as const, error: message, serverIp: await mod.serverIp() };
      }
    }
    await mod.setCreds(data.apiKey, data.apiSecret, context.userId);
    return { ok: true as const };
  });

export const redotpayDisconnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./redotpay.server");
    await mod.clearCreds();
    return { ok: true as const };
  });

export const redotpayBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./redotpay.server");
    try {
      return { ok: true as const, data: await mod.fetchBalance() };
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message ?? e) };
    }
  });
