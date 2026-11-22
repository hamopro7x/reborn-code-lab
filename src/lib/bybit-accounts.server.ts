// Bybit account metadata and read-access helpers.
import { normalizeBybitError } from "./bybit-errors";
import { admin } from "./bybit-db.server";
import { bybitConfigured } from "./bybit-credentials.server";
import { call, testCreds } from "./bybit-client.server";

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
  if (kErr) throw new Error(kErr.message);
  return { id: data.id as string, name, uid };
}

export async function deleteAccount(accountId: string) {
  const db = await admin();
  const { error } = await db.from("bybit_accounts").delete().eq("id", accountId);
  if (error) throw new Error(error.message);
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
