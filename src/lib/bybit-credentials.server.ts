// Bybit API credential lookup and encrypted integration-key persistence.
import { admin } from "./bybit-db.server";

export type Creds = { key: string; secret: string };

async function accountCreds(accountId: string): Promise<Creds | null> {
  try {
    const db = await admin();
    const { data } = await db.rpc("bybit_account_get_keys", { p_account_id: accountId });
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.api_key && row?.api_secret) return { key: row.api_key, secret: row.api_secret };
  } catch {
    /* ignore */
  }
  return null;
}
async function dbCreds(): Promise<Creds | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any).rpc("integration_get_bybit");
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.api_key && row?.api_secret) return { key: row.api_key, secret: row.api_secret };
  } catch {
    /* fall back to env */
  }
  return null;
}
/**
 * Credential resolution is STRICTLY scoped:
 * - with an accountId → only that account's own keys (never another account's,
 *   never the legacy global key). This is what stops one broken/new account from
 *   silently reading a different account's data.
 * - without an accountId → the legacy single-key integration (DB, then env).
 */
export async function getCreds(accountId?: string): Promise<Creds> {
  if (accountId) {
    const perAccount = await accountCreds(accountId);
    if (perAccount) return perAccount;
    throw new Error("BYBIT_ACCOUNT_KEYS_MISSING");
  }
  const fromDb = await dbCreds();
  if (fromDb) return fromDb;
  const key = process.env["BYBIT_API_KEY"];
  const secret = process.env["BYBIT_API_SECRET"];
  if (!key || !secret) throw new Error("BYBIT_NOT_CONFIGURED");
  return { key, secret };
}

export async function bybitConfigured(accountId?: string) {
  if (accountId) return Boolean(await accountCreds(accountId));
  if (process.env["BYBIT_API_KEY"] && process.env["BYBIT_API_SECRET"]) return true;
  return Boolean(await dbCreds());
}
export async function saveCreds(key: string, secret: string, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any).rpc("integration_set_bybit", {
    p_key: key,
    p_secret: secret,
    p_by: userId,
  });
  if (error) throw new Error(error.message);
}

export async function clearCreds() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as any).rpc("integration_clear_bybit");
}
