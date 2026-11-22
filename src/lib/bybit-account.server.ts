import { createHmac } from "crypto";
import { normalizeBybitError, type BybitError } from "./bybit-errors";
import { BYBIT_BASE_URL as BASE, BYBIT_RECV_WINDOW as RECV, sleep } from "./bybit-runtime";

export type Creds = { key: string; secret: string };

export type BybitAccount = {
  id: string;
  name: string;
  uid: string | null;
  email: string | null;
  createdAt: string;
  sortOrder: number;
  monthlyCashback: number;
  frozen: boolean;
  frozenUntil: string | null;
};

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function listAccounts(): Promise<BybitAccount[]> {
  const db = await admin();
  const cols = "id, name, uid, email, created_at, sort_order, monthly_cashback";
  // Keep shared-table isolation until independently managed account cleanup is complete.
  // Before the provider column exists every row is a Bybit account.
  const first = await db
    .from("bybit_accounts")
    .select(cols)
    .or("provider.is.null,provider.eq.bybit")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  let data = first.data;
  const listError = first.error;
  if (listError && (String(listError.code) === "42703" || /provider/i.test(String(listError.message ?? "")))) {
    ({ data } = await db
      .from("bybit_accounts")
      .select(cols)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }));
  }
  // `frozen` is read separately so the list still works before the column exists.
  const frozenIds = new Map<string, string | null>();
  try {
    const { data: fz, error } = await db.from("bybit_accounts").select("id, frozen, frozen_until").eq("frozen", true);
    if (!error) {
      const expired: string[] = [];
      for (const r of (fz ?? []) as any[]) {
        if (r.frozen_until && new Date(r.frozen_until).getTime() <= Date.now()) expired.push(r.id);
        else frozenIds.set(r.id, r.frozen_until ?? null);
      }
      if (expired.length) await db.from("bybit_accounts").update({ frozen: false, frozen_until: null } as any).in("id", expired);
    }
  } catch {
    /* column not applied yet */
  }
  return (data ?? []).map((r: any) => ({
    frozen: frozenIds.has(r.id),
    frozenUntil: frozenIds.get(r.id) ?? null,
    id: r.id,
    name: r.name ?? "Bybit",
    uid: r.uid ?? null,
    email: r.email ?? null,
    createdAt: r.created_at,
    sortOrder: Number(r.sort_order ?? 0),
    monthlyCashback: Number(r.monthly_cashback ?? 0),
  }));
}

/** Renames an account / updates its monthly cashback percentage / visa number. */
export async function updateAccount(input: { id: string; name?: string; monthlyCashback?: number; sortOrder?: number; frozen?: boolean; frozenUntil?: string | null }) {
  const db = await admin();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.monthlyCashback !== undefined) patch.monthly_cashback = input.monthlyCashback;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.frozen !== undefined) {
    patch.frozen = input.frozen;
    patch.frozen_until = input.frozen ? input.frozenUntil ?? null : null;
  }
  if (!Object.keys(patch).length) return;
  const { error } = await db.from("bybit_accounts").update(patch).eq("id", input.id);
  if (error) throw new Error(error.message);
}

/** Persists a new display order: ids[0] becomes Visa #1. */
export async function reorderAccounts(ids: string[]) {
  const db = await admin();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await db.from("bybit_accounts").update({ sort_order: i + 1 }).eq("id", ids[i]);
    if (error) throw new Error(error.message);
  }
}


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

/** Public egress IP of this server (for Bybit IP allow-lists). */
export async function serverIp(): Promise<string | null> {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const j: any = await res.json();
    return j?.ip ? String(j.ip) : null;
  } catch {
    return null;
  }
}

/** Creates a Bybit account entry; name/uid come from Bybit itself. */
export async function createAccount(key: string, secret: string, userId: string, customName?: string, force = false) {
  if (force) {
    try {
      await testCreds({ key, secret });
    } catch {
      /* admin chose to save anyway */
    }
  } else {
    await testCreds({ key, secret });
  }
  let uid: string | null = null;
  try {
    const info = await call("GET", "/v5/user/query-api", {}, { key, secret });
    uid = info?.userID ? String(info.userID) : null;
  } catch {
    /* optional */
  }
  const db = await admin();
  const name =
    (customName ?? "").trim() ||
    (uid ? `Bybit · UID ${uid}` : `Bybit · ${key.slice(0, 4)}${key.slice(-4)}`);
  // Visa numbers count Bybit accounts only.
  const nextOrder = Math.max(0, ...(await listAccounts()).map((a) => a.sortOrder)) + 1;
  const { data, error } = await db
    .from("bybit_accounts")
    .insert({ name, uid, created_by: userId, sort_order: nextOrder })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  const { error: kErr } = await db.rpc("bybit_account_set_keys", {
    p_account_id: data.id,
    p_key: key,
    p_secret: secret,
    p_by: userId,
  });
  if (kErr) {
    // Avoid leaving an account row visible without its own encrypted credentials.
    const { error: cleanupError } = await db.from("bybit_accounts").delete().eq("id", data.id);
    if (cleanupError) {
      throw new Error(`تعذر حفظ مفاتيح الحساب وتنظيف السجل الناقص: ${kErr.message}; ${cleanupError.message}`);
    }
    throw new Error(kErr.message);
  }
  return { id: data.id as string, name, uid };
}

export async function deleteAccount(accountId: string) {
  const db = await admin();
  const { error } = await db.from("bybit_accounts").delete().eq("id", accountId);
  if (error) throw new Error(error.message);
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

/**
 * The one and only wrapper every read endpoint of "معاملات الفيزا" goes through:
 * same configured-check, same credential scoping, same normalized error shape.
 * New endpoints/accounts need no bespoke error handling.
 */
export async function readOp<T extends Record<string, unknown>>(
  accountId: string | undefined,
  run: () => Promise<T>,
  fallback: T,
): Promise<T & { configured: boolean; failed?: string; errorCode?: string }> {
  if (!(await bybitConfigured(accountId))) {
    const { code, message } = normalizeBybitError(
      new Error(accountId ? "BYBIT_ACCOUNT_KEYS_MISSING" : "BYBIT_NOT_CONFIGURED"),
    );
    return { ...fallback, configured: false, failed: message, errorCode: code };
  }
  try {
    return { ...(await run()), configured: true };
  } catch (e) {
    const { code, message } = normalizeBybitError(e);
    return { ...fallback, configured: true, failed: message, errorCode: code };
  }
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

/** Validates a key/secret pair on its own — never touches stored accounts. */
export async function testCreds(c: Creds) {
  // Different keys have different scopes; accept the key if ANY read endpoint works.
  const attempts: Array<() => Promise<unknown>> = [
    () => call("GET", "/v5/account/wallet-balance", { accountType: "UNIFIED" }, c),
    () => call("GET", "/v5/asset/transfer/query-account-coins-balance", { accountType: "FUND" }, c),
    () => call("GET", "/v5/asset/deposit/query-record", { limit: 1 }, c),
    () => call("GET", "/v5/user/query-api", {}, c),
  ];
  const errors: unknown[] = [];
  for (const run of attempts) {
    try {
      await run();
      return true;
    } catch (e) {
      errors.push(e);
    }
  }
  // Report the most actionable failure using the shared error rules.
  const normalized: BybitError[] = errors.map((e) => normalizeBybitError(e));
  const priority: Array<BybitError["code"]> = ["NO_PERMISSION", "IP_RESTRICTED", "BAD_KEY", "RATE_LIMITED", "NETWORK"];
  const pick = priority.map((c2) => normalized.find((n) => n.code === c2)).find(Boolean) ?? normalized[0];
  throw new Error(pick?.message ?? "تعذّر التحقق من المفتاح");
}


export async function call(method: "GET" | "POST", path: string, params: Record<string, unknown> = {}, override?: Creds) {
  const { key, secret } = override ?? (await getCreds());
  let url = `${BASE}${path}`;
  let payload = "";
  let body: string | undefined;

  if (method === "GET") {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    payload = qs;
    if (qs) url += `?${qs}`;
  } else {
    body = JSON.stringify(params);
    payload = body;
  }

  // Bybit occasionally rate-limits or drops a connection. A single 6s attempt
  // made whole accounts render as "failed"; retry transient failures instead.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ts = Date.now().toString();
    const sign = createHmac("sha256", secret).update(ts + key + RECV + payload).digest("hex");
    try {
      const res = await fetch(url, {
        method,
        signal: AbortSignal.timeout(15_000),
        headers: {
          "X-BAPI-API-KEY": key,
          "X-BAPI-TIMESTAMP": ts,
          "X-BAPI-RECV-WINDOW": RECV,
          "X-BAPI-SIGN": sign,
          "X-BAPI-SIGN-TYPE": "2",
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body } : {}),
      });

      const text = await res.text();
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Bybit HTTP ${res.status}`);
        await sleep(700 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`Bybit HTTP ${res.status}: ${text.slice(0, 400)}`);
      const json = JSON.parse(text) as {
        retCode?: number;
        retMsg?: string;
        ret_code?: number;
        ret_msg?: string;
        result: any;
      };
      const retCode = json.retCode ?? json.ret_code;
      const retMsg = json.retMsg ?? json.ret_msg ?? "Unknown error";
      if (retCode === 10006 || retCode === 10016) {
        lastErr = new Error(`Bybit ${retCode}: ${retMsg}`);
        await sleep(900 * (attempt + 1));
        continue;
      }
      if (retCode !== 0) throw new Error(`Bybit ${retCode ?? "UNKNOWN"}: ${retMsg}`);
      return json.result ?? {};
    } catch (e: any) {
      const msg = String(e?.name ?? "") + String(e?.message ?? e);
      const transient = /Abort|timeout|timed out|fetch failed|ECONNRESET|network/i.test(msg);
      if (!transient) throw e;
      lastErr = e;
      await sleep(700 * (attempt + 1));
    }
  }
  throw new Error(String((lastErr as any)?.message ?? lastErr ?? "Bybit request failed"));
}
