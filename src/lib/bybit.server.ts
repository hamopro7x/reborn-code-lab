import { createHmac } from "crypto";
import { normalizeBybitError, type BybitError } from "./bybit-errors";
import { sumSpend, sumSpendByCard, type SpendRow } from "./bybit-spend";


const BASE = "https://api.bybit.com";
const RECV = "5000";

type Creds = { key: string; secret: string };

export type BybitAccount = {
  id: string;
  name: string;
  uid: string | null;
  email: string | null;
  createdAt: string;
  sortOrder: number;
  monthlyCashback: number;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function listAccounts(): Promise<BybitAccount[]> {
  const db = await admin();
  const { data } = await db
    .from("bybit_accounts")
    .select("id, name, uid, email, created_at, sort_order, monthly_cashback")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []).map((r: any) => ({
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
export async function updateAccount(input: { id: string; name?: string; monthlyCashback?: number; sortOrder?: number }) {
  const db = await admin();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.monthlyCashback !== undefined) patch.monthly_cashback = input.monthlyCashback;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
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
  const { data: last } = await db
    .from("bybit_accounts")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = Number(last?.sort_order ?? 0) + 1;
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


async function call(method: "GET" | "POST", path: string, params: Record<string, unknown> = {}, override?: Creds) {
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

const num = (v: unknown) => Number(v ?? 0) || 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CARD_PATH = "/v5/card/transaction/query-asset-records";
const cardCache = new Map<string, { at: number; rows: any[] }>();
const cardInflight = new Map<string, Promise<any[]>>();

const CARD_QUERY_TYPES = ["SIDE_QUERY_AUTH", "SIDE_QUERY_FINANCIAL", "SIDE_QUERY_REFUND"];

/**
 * Storage key of ONE raw Bybit record (not of a purchase).
 * Raw authorisation and settlement records are kept side by side for auditing;
 * deciding that two records are the SAME purchase is the job of
 * `getCanonicalTransactionIdentity` in ./bybit-spend, which every total uses.
 */
function cardRowKey(t: any) {
  return String(
    t?.txnId
      ?? t?.orderNo
      ?? [t?.txnCreate, t?.merchName, t?.pan4, t?.side, t?.basicAmount ?? t?.transactionAmount].join("-"),
  );
}

/** Canonical purchase identity of a raw provider row (shared engine, stored for audit). */
function canonicalIdOfRaw(t: any) {
  return getCanonicalTransactionIdentity({
    txnId: String(t?.txnId ?? t?.transactionId ?? t?.id ?? ""),
    amount: num(t?.basicAmount ?? t?.transactionAmount),
    time: Number(t?.txnCreate ?? 0),
    detail: {
      paymentId: t?.paymentId,
      orderNo: t?.orderNo,
      orderId: t?.orderId,
      referenceId: t?.referenceId,
      refId: t?.refId,
      merchName: t?.merchName,
    },
  });
}


/** Bybit Card expects POST filters and pagination in the signed JSON body. */
async function callCardPage(params: Record<string, unknown>, creds: Creds) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );
  const body = JSON.stringify(clean);
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const ts = Date.now().toString();
    const sign = createHmac("sha256", creds.secret)
      .update(ts + creds.key + RECV + body)
      .digest("hex");
    const res = await fetch(`${BASE}${CARD_PATH}`, {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "X-BAPI-API-KEY": creds.key,
        "X-BAPI-TIMESTAMP": ts,
        "X-BAPI-RECV-WINDOW": RECV,
        "X-BAPI-SIGN": sign,
        "X-BAPI-SIGN-TYPE": "2",
        "Content-Type": "application/json",
      },
      body,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Bybit HTTP ${res.status}: ${text.slice(0, 400)}`);
    const json = JSON.parse(text) as { retCode?: number; retMsg?: string; result?: any };
    if (json.retCode === 0) return json.result ?? {};
    // 10006 = rate limited: back off and retry
    if (json.retCode === 10006) {
      lastErr = json.retMsg ?? "rate limited";
      await sleep(1200 * (attempt + 1));
      continue;
    }
    throw new Error(`Bybit ${json.retCode ?? "UNKNOWN"}: ${json.retMsg ?? "Unknown error"}`);
  }
  throw new Error(`Bybit rate limited: ${lastErr}`);
}

/** Fetch every card record ever recorded on the account, for every Bybit query type. */
async function fetchCardPages(maxRows: number, creds: Creds): Promise<any[]> {
  const merged = new Map<string, { row: any; sourcePriority: number; updatedAt: number }>();
  const pageSize = 100; // Bybit caps this endpoint at 100 per page (larger values silently return 10)
  const maxPages = Math.max(1, Math.ceil(maxRows / pageSize));

  for (const [typeIndex, type] of CARD_QUERY_TYPES.entries()) {
    try {
      for (let page = 1; page <= maxPages; page++) {
        const result = await callCardPage({
          limit: pageSize,
          page,
          type,
        }, creds);
        const rows = Array.isArray(result?.data) ? result.data : [];
        for (const r of rows) {
          const k = cardRowKey(r);
          const updatedAt = Number(r?.txnUpdate ?? r?.updateTime ?? r?.updatedTime ?? r?.settleTime ?? r?.txnCreate ?? 0);
          const current = merged.get(k);
          // The same transaction can be returned by AUTH first and FINANCIAL
          // later. Keep the provider's later/more final record instead of
          // freezing the initial authorisation (usually pending).
          if (
            !current ||
            typeIndex > current.sourcePriority ||
            (typeIndex === current.sourcePriority && updatedAt > current.updatedAt)
          ) {
            merged.set(k, { row: r, sourcePriority: typeIndex, updatedAt });
          }
        }
        const totalCount = Number(result?.totalCount ?? 0);
        const pageNo = Number(result?.pageNo ?? page);
        const returnedPageSize = Number(result?.pageSize ?? pageSize);
        if (!rows.length || (totalCount > 0 && pageNo * returnedPageSize >= totalCount)) break;
        await sleep(250);
      }
    } catch {
      /* a type may be unsupported for this key; keep the others */
    }
    await sleep(400);
  }

  return [...merged.values()]
    .map(({ row }) => row)
    .sort((a, b) => Number(b?.txnCreate ?? 0) - Number(a?.txnCreate ?? 0));
}

async function callCard(limit: number, accountId?: string, creds?: Creds): Promise<any[]> {
  const key = accountId ?? "default";
  const cached = cardCache.get(key);
  if (cached && Date.now() - cached.at < 30_000) return cached.rows;
  const running = cardInflight.get(key);
  if (running) return running;
  const p = fetchCardPages(Math.max(limit, 100), creds ?? (await getCreds(accountId)))
    .then((rows) => {
      cardCache.set(key, { at: Date.now(), rows });
      return rows;
    })
    .finally(() => {
      cardInflight.delete(key);
    });
  cardInflight.set(key, p);
  return p;
}

const STABLES = new Set(["USDT", "USDC", "USD", "DAI", "FDUSD", "TUSD", "BUSD"]);

// "Is this row real spending?" now lives in ./bybit-spend (spendKind/spendUsd)
// so daily spend, monthly spend and per-card spend cannot drift apart, and a
// purchase archived as both an authorisation and a settlement is counted once.


/* ---------- dynamic card-limit reset window ---------- */

const CARD_LIMIT_PATHS = [
  "/v5/card/limit/query",
  "/v5/card/query-limit",
  "/v5/card/account/query-limit",
];
const RESET_KEY_RE = /(reset|refresh|renew|nextcycle|cyclestart|cycleend)/i;
const resetCache = new Map<string, { at: number; next: number | null }>();

/** Walks any Bybit payload for a "next reset" timestamp (ms or s). */
function findResetTs(node: unknown, now: number, depth = 0): number | null {
  if (depth > 6 || node === null || typeof node !== "object") return null;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (v && typeof v === "object") {
      const nested = findResetTs(v, now, depth + 1);
      if (nested) return nested;
      continue;
    }
    if (!RESET_KEY_RE.test(k)) continue;
    let n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (n < 1e12) n *= 1000; // seconds → ms
    // plausible: within the next 48h
    if (n > now && n - now < 48 * 3600_000) return n;
  }
  return null;
}

/**
 * Asks Bybit itself when the card limit cycle resets. If Bybit ever changes the
 * reset hour, the dashboard follows automatically. Falls back to Bybit server
 * time at 00:00 UTC (the current behaviour) when no reset field is exposed.
 */
async function nextResetFromBybit(accountId: string | undefined, creds?: Creds): Promise<number | null> {
  const key = accountId ?? "default";
  const cached = resetCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.next;

  const now = Date.now();
  let next: number | null = null;
  for (const path of CARD_LIMIT_PATHS) {
    try {
      const res = await call("POST", path, {}, creds);
      next = findResetTs(res, now);
      if (next) break;
    } catch {
      try {
        const res = await call("GET", path, {}, creds);
        next = findResetTs(res, now);
        if (next) break;
      } catch {
        /* endpoint unavailable for this key */
      }
    }
  }
  resetCache.set(key, { at: now, next });
  return next;
}

/** Bybit server clock (falls back to local time). */
async function bybitNow(): Promise<number> {
  try {
    const res = await fetch(`${BASE}/v5/market/time`);
    const j: any = await res.json();
    const ms = Number(j?.result?.timeNano ?? 0) / 1e6 || Number(j?.time ?? 0);
    if (ms > 1e12) return ms;
  } catch {
    /* ignore */
  }
  return Date.now();
}

/** Current day/month spend window boundaries, aligned to Bybit's own reset. */
async function spendWindow(accountId?: string, creds?: Creds) {
  const nowMs = await bybitNow();
  const next = await nextResetFromBybit(accountId, creds);
  const DAY = 24 * 3600_000;
  if (next) {
    // roll back full days from the announced reset to get the current cycle start
    let dayStart = next - DAY;
    while (dayStart > nowMs) dayStart -= DAY;
    const d = new Date(dayStart);
    const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + (dayStart % DAY === 0 ? 0 : dayStart % DAY);
    return { dayStart, monthStart: Math.min(monthStart, dayStart) };
  }
  const n = new Date(nowMs);
  return {
    dayStart: Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()),
    monthStart: Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1),
  };
}

/**
 * Fixed spend cycles, computed independently of each other:
 *  - daily  : today 03:00 Cairo (= 00:00 UTC) — unchanged, already correct
 *  - monthly: the 1st of the month at 00:00 UTC (previous month when earlier)
 */
export function spendWindows(nowMs: number) {
  const n = new Date(nowMs);
  const DAY = 24 * 3600_000;
  // Cairo is UTC+3, so 03:00 Cairo == 00:00 UTC
  let dayStart = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 0);
  if (nowMs < dayStart) dayStart -= DAY;

  // Monthly cycle anchor: 1st day of the month at 00:00 UTC
  let monthStart = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1, 0);
  if (nowMs < monthStart) monthStart = Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1, 0);

  return { dayStart, monthStart };
}


/**
 * Sums the account's own archived transactions for each window separately.
 *
 * Rows are paged (the API caps a response at 1000 rows) and handed to the single
 * shared spend engine in ./bybit-spend, which collapses the authorisation and
 * settlement copies of the same purchase into one entry and reads a
 * USD-denominated amount. That engine — not this loop — decides what counts, so
 * every account and every caller produces the same total.
 */
export async function computeSpend(accountId: string | undefined, dayStart: number, monthStart: number) {
  const collected: SpendRow[] = [];

  const seenRows = new Set<string>();
  try {
    const db = await admin();
    const from = Math.min(dayStart, monthStart);
    const CHUNK = 1000;
    for (let offset = 0; offset < 200_000; offset += CHUNK) {
      let query = (db as any)
        .from("bybit_card_txns")
        .select("txn_id, amount, currency, txn_time, status, txn_type, detail")
        .gte("txn_time", from)
        .order("txn_time", { ascending: false })
        .order("txn_id", { ascending: true })
        .range(offset, offset + CHUNK - 1);
      if (accountId) query = query.eq("account_id", accountId);
      const { data } = await query;
      const rows: any[] = data ?? [];
      for (const row of rows) {
        // Guards against a row appearing in two pages when the archive grows
        // between requests; the spend engine de-duplicates purchases separately.
        const rowKey = `${row.txn_id ?? ""}|${row.txn_time ?? ""}`;
        if (seenRows.has(rowKey)) continue;
        seenRows.add(rowKey);
        collected.push(row);
      }
      if (rows.length < CHUNK) break;
    }
  } catch {
    /* balances should still render if the archive is temporarily unavailable */
  }

  const totals = sumSpend(
    collected.map((row: any) => ({
      txnId: String(row.txn_id ?? ""),
      amount: num(row.amount),
      time: Number(row.txn_time ?? 0),
      status: row.status,
      type: row.txn_type,
      currency: row.currency,
      detail: (row.detail ?? {}) as Record<string, unknown>,
    })),
    dayStart,
    monthStart,
  );

  return {
    daySpend: totals.daySpend,
    monthSpend: totals.monthSpend,
    dayFees: totals.dayFees,
    monthFees: totals.monthFees,
    txnCount: totals.countedTxns,
    lastTxnTime: totals.lastTxnTime,
    skippedNonUsd: totals.skippedNonUsd,
  };
}


async function spotPrices(): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${BASE}/v5/market/tickers?category=spot`);
    const json: any = await res.json();
    const out: Record<string, number> = {};
    for (const t of json?.result?.list ?? []) {
      const sym = String(t?.symbol ?? "");
      if (!sym.endsWith("USDT")) continue;
      out[sym.slice(0, -4)] = Number(t?.lastPrice ?? 0) || 0;
    }
    return out;
  } catch {
    return {};
  }
}

export async function fetchOverview(accountId?: string) {
  const creds = await getCreds(accountId);
  // Keep the overview lightweight: card history is served from the database
  // in its own tab and must never hold up the account summary.
  const [unified, funding, prices] = await Promise.allSettled([
    call("GET", "/v5/account/wallet-balance", { accountType: "UNIFIED" }, creds),
    call("GET", "/v5/asset/transfer/query-account-coins-balance", { accountType: "FUND" }, creds),
    spotPrices(),
  ]);

  const coins: Array<{ coin: string; balance: number; usd: number }> = [];
  const priceMap: Record<string, number> = prices.status === "fulfilled" ? prices.value : {};
  const usdOf = (coin: string, bal: number, given: number) => {
    if (given) return given;
    const c = String(coin ?? "").toUpperCase();
    if (STABLES.has(c)) return bal;
    return bal * (priceMap[c] ?? 0);
  };

  let total = 0;
  if (unified.status === "fulfilled") {
    const acct = unified.value?.list?.[0];
    total += num(acct?.totalEquity);
    for (const c of acct?.coin ?? []) {
      const bal = num(c.walletBalance);
      if (!bal) continue;
      coins.push({ coin: c.coin, balance: bal, usd: usdOf(c.coin, bal, num(c.usdValue)) });
    }
  }
  if (funding.status === "fulfilled") {
    for (const c of funding.value?.balance ?? []) {
      const bal = num(c.walletBalance);
      if (!bal) continue;
      const usd = usdOf(c.coin, bal, 0);
      total += usd;
      coins.push({ coin: c.coin, balance: bal, usd });
    }
  }

  // Spending is always computed from the archived transactions of THIS account,
  // independently for the daily and the monthly window. Limits returned by
  // Bybit are never used as a source for spending.
  const { dayStart, monthStart } = spendWindows(await bybitNow().catch(() => Date.now()));
  const archivedSpend = await computeSpend(accountId, dayStart, monthStart);
  const daySpend = archivedSpend.daySpend;

  return {
    totalUsd: total,
    monthSpend: archivedSpend.monthSpend,
    daySpend,
    monthFees: archivedSpend.monthFees,
    dayFees: archivedSpend.dayFees,
    dayStart,
    monthStart,
    txnCount: archivedSpend.txnCount,
    lastTxnTime: archivedSpend.lastTxnTime,
    // Purchases whose amount Bybit reported in a non-USD currency: reported, so
    // they are never silently summed as dollars.
    skippedNonUsd: archivedSpend.skippedNonUsd,

    coins: coins.sort((a, b) => b.usd - a.usd).slice(0, 12),
    errors: [unified, funding]
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => String(r.reason?.message ?? r.reason)),
  };
}

export type CardTxn = {
  id: string;
  merchant: string;
  amount: number;
  currency: string;
  status: "success" | "failed" | "refund" | "pending";
  time: number;
  pan4: string;
  type: string;
  detail: Record<string, string | number | null>;
};

function sanitize(o: Record<string, unknown>): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined) out[k] = null;
    else if (typeof v === "number" || typeof v === "string") out[k] = v;
    else out[k] = String(v);
  }
  return out;
}

/** First non-empty value among the given raw keys, otherwise null. */
function pick(t: any, keys: string[]): string | number | null {
  for (const k of keys) {
    const v = t?.[k];
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "number" || typeof v === "string") return v;
    return JSON.stringify(v);
  }
  return null;
}

/**
 * Full transaction stage, derived ONLY from values the provider returned.
 * Never inferred when the provider gives nothing.
 */
function stageOf(t: any): string | null {
  const explicit = pick(t, ["eventCode", "transactionEventCode", "txnEventCode", "transactionType", "txnType"]);
  if (explicit !== null) return String(explicit);
  const ts = String(t?.tradeStatus ?? t?.status ?? "");
  const map: Record<string, string> = {
    "0": "PENDING",
    "1": "COMPLETED",
    "2": "DECLINED",
    "3": "REFUNDED",
    "4": "REVERSED",
    "5": "REFUNDED",
  };
  return map[ts] ?? null;
}

function mapCardTxn(t: any): CardTxn {
    const tradeStatus = String(t.tradeStatus ?? t.status ?? "");
    const upper = tradeStatus.toUpperCase();
    const side = String(t.side ?? "");
    const isRefund =
      ["3", "5", "6", "7", "10", "11"].includes(side) ||
      tradeStatus === "3" ||
      /REFUND|REVERS|CHARGEBACK/.test(upper);
    // Bybit only returns card rows that already reached a financial outcome.
    // Anything that is not explicitly a refund or a decline is a real purchase,
    // so we never surface "pending" for card transactions.
    const status: CardTxn["status"] = isRefund
      ? "refund"
      : tradeStatus === "2" || /FAIL|DECLIN|REJECT|CANCEL/.test(upper)
        ? "failed"
        : "success";


    return {
      id: cardRowKey(t),
      merchant: String(t.merchName ?? "—"),
      amount: num(t.basicAmount ?? t.transactionAmount),
      currency: String(t.basicCurrency ?? t.transactionCurrency ?? "USD"),
      status,
      time: Number(t.txnCreate ?? 0),
      pan4: String(t.pan4 ?? ""),
      type: side,
      detail: sanitize({
        // ---- core identifiers ----
        txnId: pick(t, ["txnId", "transactionId", "id"]),
        orderId: pick(t, ["orderNo", "orderId", "referenceId", "refId"]),
        paymentId: pick(t, ["paymentId", "orderNo"]),
        authCode: pick(t, ["authCode", "authorizationCode"]),
        // ---- status ----
        stage: stageOf(t),
        eventCode: pick(t, ["eventCode", "transactionEventCode", "txnEventCode"]),
        tradeStatus: t.tradeStatus ?? t.status ?? null,
        side: t.side ?? null,
        createdAt: pick(t, ["txnCreate", "createTime", "createdTime"]),
        updatedAt: pick(t, ["txnUpdate", "updateTime", "updatedTime", "settleTime"]),
        // ---- amounts & fees ----
        transactionAmount: t.transactionAmount ?? null,
        transactionCurrency: t.transactionCurrency ?? null,
        basicAmount: t.basicAmount ?? null,
        basicCurrency: t.basicCurrency ?? null,
        localAmount: t.localAmount ?? t.originalAmount ?? null,
        localCurrency: t.localCurrency ?? t.originalCurrency ?? null,
        grossAmount: pick(t, ["grossAmount", "totalAmount"]),
        netAmount: pick(t, ["netAmount", "settleAmount"]),
        // Bybit's own USD valuation of a foreign-currency purchase, kept verbatim
        // so spend never needs an exchange rate of our own.
        settleAmount: pick(t, ["settleAmount", "settlementAmount"]),
        settleCurrency: pick(t, ["settleCurrency", "settlementCurrency"]),
        usdAmount: pick(t, ["usdAmount", "amountUsd", "usdValue", "convertUsdAmount"]),
        // Fees exactly as the source account returns them (no math, no fallbacks).
        totalFees: pick(t, ["totalFees"]),
        foreignTransactionFee: pick(t, ["foreignTransactionFee", "foreignTxnFee"]),
        interchangeFee: pick(t, ["interchangeFee"]),
        withdrawalFee: pick(t, ["withdrawalFee"]),
        fxPad: pick(t, ["fxPad"]),
        feeAmount: pick(t, ["totalFees", "feeAmount", "fee", "handlingFee"]),
        feeCurrency: pick(t, ["feeCurrency", "foreignTxnFeeCurrency"]),
        tax: pick(t, ["tax", "taxAmount"]),
        shipping: pick(t, ["shipping", "shippingAmount"]),
        paidWithCrypto: t.cryptoAmount ?? null,
        paidWithFiat: t.fiatAmount ?? null,
        protectionEligibility: pick(t, ["protectionEligibility", "protectionEligibilityType"]),
        // ---- processor / decline data ----
        responseCode: pick(t, ["responseCode", "processorResponseCode", "respCode"]),
        avsCode: pick(t, ["avsCode", "avsResponseCode", "avsResult"]),
        cvvCode: pick(t, ["cvvCode", "cvv2Code", "cvvResult"]),
        paymentAdviceCode: pick(t, ["paymentAdviceCode", "adviceCode"]),
        declineCode: pick(t, ["declineCode", "failCode", "rejectCode", "errorCode"]),
        declineReason: pick(t, [
          "declineReason",
          "failReason",
          "rejectReason",
          "reason",
          "statusReason",
          "errorMsg",
          "errorMessage",
          "retMsg",
          "msg",
        ]),
        apiErrorCode: pick(t, ["retCode", "httpCode", "statusCode"]),
        // ---- merchant ----
        merchantName: t.merchName ?? null,
        merchantWebsite: pick(t, ["merchWebsite", "merchUrl", "merchantUrl", "website"]),
        merchantEmail: pick(t, ["merchEmail", "merchantEmail", "supportEmail"]),
        merchantDescription: pick(t, ["merchDesc", "merchantDescription", "description", "remark"]),
        mcc: t.mcc ?? t.merchCategory ?? null,
        merchantLocation: [t.merchCity, t.merchCountry].filter(Boolean).join(", ") || null,
        terminalId: pick(t, ["terminalId", "terminalNo"]),
        storeId: pick(t, ["storeId", "storeNo", "merchId", "merchantId"]),
        // ---- raw provider payload, stored verbatim ----
        raw: JSON.stringify(t),
      }),
    };
}


const MAX_TXNS = 10_000_000;
const PRUNE_TO_DELETE = 3_000_000;

/** Persist fetched rows and enforce the 10M cap (oldest 3M pruned). */
async function persistCardTxns(rows: CardTxn[], accountId?: string) {
  if (!rows.length) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = rows.map((r) => ({
        txn_id: r.id,
        account_id: accountId ?? null,
        merchant: r.merchant,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        txn_time: r.time,
        pan4: r.pan4,
        txn_type: r.type,
        detail: r.detail,
    }));
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await (supabaseAdmin as any)
        .from("bybit_card_txns")
        .upsert(payload.slice(i, i + 500), { onConflict: "account_id,txn_id" });
      if (error) console.error("bybit_card_txns upsert failed:", error.message);
    }
    await (supabaseAdmin as any).rpc("prune_bybit_card_txns", {
      p_max: MAX_TXNS,
      p_delete: PRUNE_TO_DELETE,
    });
  } catch (e) {
    console.error("bybit_card_txns persist failed:", (e as any)?.message ?? e);
  }

}

/**
 * Full archive read, server-side only (per-card spend aggregation).
 * Never returned to the browser: the whole archive is too large for one
 * response, which is why the visible table pages through it instead.
 */
async function storedCardTxns(limit: number, accountId?: string): Promise<CardTxn[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const CHUNK = 1000;
    const BATCH = 10;
    const data: any[] = [];
    for (let base = 0; base < limit; base += CHUNK * BATCH) {
      const requests: any[] = [];
      for (let i = 0; i < BATCH; i++) {
        const from = base + i * CHUNK;
        let query = (supabaseAdmin as any)
          .from("bybit_card_txns")
          .select("txn_id, merchant, amount, currency, status, txn_time, pan4, txn_type, detail");
        if (accountId) query = query.eq("account_id", accountId);
        requests.push(query.order("txn_time", { ascending: false }).range(from, from + CHUNK - 1));
      }
      const chunks = await Promise.all(requests);
      const rows = chunks.flatMap(({ data: chunk }: any) => chunk ?? []);
      data.push(...rows);
      if (rows.length < CHUNK * BATCH) break;
    }
    return data.map(mapStoredRow);
  } catch {
    return [];
  }
}

/** Maps one archived row to the shape the UI reads. */
function mapStoredRow(r: any): CardTxn {
  const detail = (r.detail ?? {}) as Record<string, string | number | null>;
  const tradeStatus = String(detail.tradeStatus ?? "");
  const upper = tradeStatus.toUpperCase();
  const side = String(detail.side ?? r.txn_type ?? "");
  const isRefund =
    ["3", "5", "6", "7", "10", "11"].includes(side) ||
    tradeStatus === "3" ||
    /REFUND|REVERS|CHARGEBACK/.test(upper);
  // The status persisted at ingest time is the source of truth. A stored
  // "pending" is a stale authorisation snapshot, so it is re-derived below and
  // card rows never render as pending.
  const stored: CardTxn["status"] | null =
    r.status === "success" || r.status === "failed" || r.status === "refund" ? r.status : null;
  const derived: CardTxn["status"] = isRefund
    ? "refund"
    : tradeStatus === "2" || /FAIL|DECLIN|REJECT|CANCEL/.test(upper)
      ? "failed"
      : "success";
  const status: CardTxn["status"] = isRefund ? "refund" : (stored ?? derived);




  return {
    id: r.txn_id,
    merchant: r.merchant ?? "—",
    amount: num(r.amount),
    currency: r.currency ?? "USD",
    status,
    time: Number(r.txn_time ?? 0),
    pan4: r.pan4 ?? "",
    type: r.txn_type ?? "",
    detail,
  };
}

export type CardTxnPage = {
  rows: CardTxn[];
  total: number;
  counts: Record<"all" | "success" | "failed" | "refund", number>;
};

/**
 * One page of the archive, filtered and counted in the database.
 * The whole archive is far too large to ship in a single response — that is why
 * the table reads it page by page instead of loading every stored row at once.
 */
export async function fetchCardTxnsPage(opts: {
  accountId?: string;
  status?: "all" | "success" | "failed" | "refund";
  page?: number;
  pageSize?: number;
}): Promise<CardTxnPage> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const status = opts.status ?? "all";
  const pageSize = Math.min(Math.max(opts.pageSize ?? 150, 10), 500);
  const page = Math.max(opts.page ?? 1, 1);
  const from = (page - 1) * pageSize;

  const base = () => {
    let q = (supabaseAdmin as any).from("bybit_card_txns");
    return { q };
  };

  const scoped = (q: any) => (opts.accountId ? q.eq("account_id", opts.accountId) : q);

  const applyStatus = (q: any, s: "all" | "success" | "failed" | "refund") =>
    s === "all" ? q : q.eq("status", s);

  // Page rows and the count for the same scope in a single round trip; the
  // three extra per-status counts were never rendered and cost a full scan each.
  const rowsQuery = applyStatus(
    scoped(
      base().q.select("txn_id, merchant, amount, currency, status, txn_time, pan4, txn_type, detail", {
        count: "exact",
      }),
    ),
    status,
  );

  const { data, error, count } = await rowsQuery
    .order("txn_time", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);

  const total = Number(count ?? (data?.length ?? 0));
  const counts = { all: total, success: 0, failed: 0, refund: 0 };
  return {
    rows: (data ?? []).map(mapStoredRow),
    total,
    counts,
  };
}

/** Sync recent records and one resumable historical chunk outside the visible read. */
export async function syncCardTxns(accountId?: string): Promise<{ added: number; backfillDone: boolean }> {
  const creds = await getCreds(accountId);
  // An explicit sync must ask the provider again; cached authorisation rows can
  // still say pending after the account history has already settled them.
  cardCache.delete(accountId ?? "default");
  const liveRows = await callCard(100, accountId, creds);
  const rows = liveRows.map(mapCardTxn);
  await persistCardTxns(rows, accountId);
  const backfill = await backfillChunk(accountId, creds);
  return { added: rows.length + backfill.rows.length, backfillDone: backfill.done };
}

/** Runs the same sync for every linked Bybit account. */
export async function syncAllCardTxns(): Promise<{ added: number; accounts: number }> {
  const accounts = await listAccounts();
  const results = await Promise.all(
    accounts.map(async (a) => {
      try {
        if (!(await bybitConfigured(a.id))) return 0;
        const { added } = await syncCardTxns(a.id);
        return added;
      } catch {
        return 0;
      }
    }),
  );
  return { added: results.reduce((s, n) => s + n, 0), accounts: accounts.length };
}

/* ---------- resumable deep backfill (back to account creation) ---------- */

type BackfillCursor = { version: number; typeIndex: number; page: number; done: boolean };
// Version 5 restarts cursors that may have been marked complete while the UI
// only executed one historical chunk. The new client keeps requesting chunks
// until this cursor reaches the oldest page for every transaction type.
const BACKFILL_VERSION = 5;
// No page cap: pagination continues until Bybit reports the last (oldest) page.
// A wall-clock budget only decides when to pause and resume from the cursor.
const BACKFILL_BUDGET_MS = 20_000;



async function readCursor(key: string): Promise<BackfillCursor> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("site_settings")
      .select("value")
      .eq("key", `bybit_backfill:${key}`)
      .maybeSingle();
    const v = data?.value ?? {};
    // Version 1 used JSON-body filters that Bybit ignored, so its cursors
    // cannot prove that financial/refund history was actually archived.
    if (Number(v.version ?? 0) !== BACKFILL_VERSION) {
      // Older cursors may have stopped early, so restart from the first page to
      // guarantee everything back to account creation is archived.
      return { version: BACKFILL_VERSION, typeIndex: 0, page: 1, done: false };
    }
    return {
      version: BACKFILL_VERSION,
      typeIndex: Number(v.typeIndex ?? 0),
      page: Math.max(1, Number(v.page ?? 1)),
      done: Boolean(v.done),
    };
  } catch {
    return { version: BACKFILL_VERSION, typeIndex: 0, page: 1, done: false };
  }
}

async function writeCursor(key: string, cursor: BackfillCursor) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("site_settings")
      .upsert({ key: `bybit_backfill:${key}`, value: cursor as any }, { onConflict: "key" });
  } catch {
    /* best effort */
  }
}

/**
 * Walks a bounded slice of the historical card pages, persists it, and stores a
 * cursor so the next request resumes where this one stopped — until every page
 * back to account creation has been archived.
 */
async function backfillChunk(
  accountId: string | undefined,
  creds: Creds,
): Promise<{ rows: CardTxn[]; done: boolean }> {
  const key = accountId ?? "default";
  const cursor = await readCursor(key);
  if (cursor.done) return { rows: [], done: true };

  const collected: any[] = [];
  let { typeIndex, page } = cursor;
  const deadline = Date.now() + BACKFILL_BUDGET_MS;

  try {
    while (typeIndex < CARD_QUERY_TYPES.length && Date.now() < deadline) {
      const result = await callCardPage(
        { limit: 100, page, type: CARD_QUERY_TYPES[typeIndex] },
        creds,
      );
      const rows = Array.isArray(result?.data) ? result.data : [];
      collected.push(...rows);


      const totalCount = Number(result?.totalCount ?? 0);
      const pageSize = Number(result?.pageSize ?? 100);
      const exhausted = !rows.length || (totalCount > 0 && page * pageSize >= totalCount);
      if (exhausted) {
        typeIndex++;
        page = 1;
      } else {
        page++;
      }
      await sleep(120);
    }
  } catch {
    /* keep whatever this chunk managed to read; retry from the cursor later */
  }

  const mapped = collected.map(mapCardTxn);
  for (let i = 0; i < mapped.length; i += 500) {
    await persistCardTxns(mapped.slice(i, i + 500), accountId);
  }
  const done = typeIndex >= CARD_QUERY_TYPES.length;
  await writeCursor(key, { version: BACKFILL_VERSION, typeIndex, page, done });
  return { rows: mapped, done };
}

export type AssetRow = {
  id: string;
  coin: string;
  chain: string;
  amount: number;
  fee: number;
  status: string;
  time: number;
  address: string;
  direction: "in" | "out";
};

export type P2PRow = {
  id: string;
  side: "buy" | "sell";
  coin: string;
  fiat: string;
  amount: number;
  quantity: number;
  price: number;
  status: string;
  counterparty: string;
  time: number;
};

const p2pStatus = (s: unknown) => {
  const v = Number(s ?? 0);
  if (v === 50) return "اكتملت";
  if (v === 40 || v === 80) return "ملغاة";
  if (v === 70) return "فشل الدفع";
  if (v === 30 || v === 100) return "قيد الاعتراض";
  if (v === 10) return "بانتظار الدفع";
  if (v === 20) return "بانتظار التحرير";
  if (v === 60) return "جارٍ الدفع";
  return "قيد التنفيذ";
};

export async function fetchP2P(accountId?: string): Promise<P2PRow[]> {
  const creds = await getCreds(accountId);
  const out: P2PRow[] = [];
  for (let page = 1; page <= 5; page++) {
    let result: any;
    try {
      result = await call("POST", "/v5/p2p/order/simplifyList", { page, size: 30 }, creds);
    } catch (e) {
      if (page === 1) throw e;
      break;
    }
    const items: any[] = result?.items ?? result?.result ?? [];
    if (!Array.isArray(items) || items.length === 0) break;
    for (const it of items) {
      out.push({
        id: String(it.id ?? it.orderId ?? ""),
        side: Number(it.side) === 1 ? "sell" : "buy",
        coin: String(it.tokenId ?? it.coin ?? ""),
        fiat: String(it.currencyId ?? it.fiat ?? ""),
        amount: num(it.amount),
        quantity: num(it.quantity ?? it.notifyTokenQuantity),
        price: num(it.price),
        status: p2pStatus(it.status),
        counterparty: String(it.targetNickName ?? it.targetUserId ?? ""),
        time: Number(it.createDate ?? it.createTime ?? 0),
      });
    }
    if (items.length < 30) break;
  }
  return out.sort((a, b) => b.time - a.time);
}

const wdStatus = (s: unknown) => {
  const v = String(s ?? "").trim().toLowerCase();
  if (v === "success" || v === "3" || v === "completed") return "ناجحة";
  return "فاشلة";
};

export async function fetchOnChain(accountId?: string): Promise<{ deposits: AssetRow[]; withdrawals: AssetRow[] }> {
  const creds = await getCreds(accountId);
  const [dep, wd] = await Promise.allSettled([
    call("GET", "/v5/asset/deposit/query-record", { limit: 50 }, creds),
    call("GET", "/v5/asset/withdraw/query-record", { limit: 50, withdrawType: 0 }, creds),
  ]);

  const deposits: AssetRow[] =
    dep.status === "fulfilled"
      ? (dep.value?.rows ?? []).map((d: any) => ({
          id: String(d.txID ?? d.txId ?? d.successAt),
          coin: String(d.coin ?? ""),
          chain: String(d.chain ?? ""),
          amount: num(d.amount),
          fee: num(d.depositFee),
          status: String(d.status) === "3" ? "ناجحة" : "فاشلة",
          time: Number(d.successAt ?? 0),
          address: String(d.toAddress ?? ""),
          direction: "in" as const,
        }))
      : [];

  const withdrawals: AssetRow[] =
    wd.status === "fulfilled"
      ? (wd.value?.rows ?? []).map((w: any) => ({
          id: String(w.withdrawId ?? w.txID),
          coin: String(w.coin ?? ""),
          chain: String(w.chain ?? ""),
          amount: -num(w.amount),
          fee: num(w.withdrawFee),
          status: wdStatus(w.status),
          time: Number(w.createTime ?? 0),
          address: String(w.toAddress ?? ""),
          direction: "out" as const,
        }))
      : [];

  return { deposits, withdrawals };
}

export async function fetchInternal(accountId?: string): Promise<{ deposits: AssetRow[]; withdrawals: AssetRow[] }> {
  const creds = await getCreds(accountId);
  const [dep, wd] = await Promise.allSettled([
    call("GET", "/v5/asset/deposit/query-internal-record", { limit: 50 }, creds),
    call("GET", "/v5/asset/withdraw/query-record", { limit: 50, withdrawType: 1 }, creds),
  ]);

  const deposits: AssetRow[] =
    dep.status === "fulfilled"
      ? (dep.value?.rows ?? []).map((d: any) => ({
          id: String(d.id ?? d.txID),
          coin: String(d.coin ?? ""),
          chain: "التحويل الداخلي",
          amount: num(d.amount),
          fee: 0,
          status: String(d.status) === "2" ? "ناجحة" : "فاشلة",
          time: Number(d.createdTime ?? 0),
          address: String(d.address ?? d.fromAddress ?? ""),
          direction: "in" as const,
        }))
      : [];

  const withdrawals: AssetRow[] =
    wd.status === "fulfilled"
      ? (wd.value?.rows ?? []).map((w: any) => ({
          id: String(w.withdrawId ?? w.txID),
          coin: String(w.coin ?? ""),
          chain: "التحويل الداخلي",
          amount: -num(w.amount),
          fee: num(w.withdrawFee),
          status: wdStatus(w.status),
          time: Number(w.createTime ?? 0),
          address: String(w.toAddress ?? ""),
          direction: "out" as const,
        }))
      : [];

  return { deposits, withdrawals };
}

export type BybitCard = {
  id?: string;
  pan4: string;
  brand: string;
  currency: string;
  status: string;
  name?: string;
  fullNumber?: string;
  cvv?: string;
  expiry?: string;
  txnCount: number;
  spend: number;
  lastUsed: number;
  virtual?: boolean;
};

/** يحدد نوع البطاقة من رقمها (IIN) */
function brandFromNumber(input: string): string | null {
  const n = String(input || "").replace(/\D/g, "");
  if (!n) return null;
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return "MasterCard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(62|81)/.test(n)) return "UnionPay";
  if (/^35/.test(n)) return "JCB";
  if (/^(6011|64[4-9]|65)/.test(n)) return "Discover";
  if (/^3(0[0-5]|[68])/.test(n)) return "Diners";
  if (/^(50|5[6-9]|6)/.test(n)) return "Maestro";
  return null;
}

/** Cards linked to the account. Stored cards are merged with spend derived from
 * the card transaction records. */
export async function fetchCards(accountId?: string): Promise<BybitCard[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let cardQuery = (supabaseAdmin as any).from("bybit_cards").select("*");
  if (accountId) cardQuery = cardQuery.eq("account_id", accountId);
  const { data: storedRows } = await cardQuery;
  const stored = (storedRows ?? []) as any[];

  const rows = await storedCardTxns(10_000, accountId);
  // Same engine as the account totals: one entry per purchase, USD amounts only.
  const perCard = sumSpendByCard(
    rows.map((t) => ({
      txnId: String(t.id ?? ""),
      amount: num(t.amount),
      time: Number(t.time ?? 0),
      status: t.status,
      type: t.type,
      currency: t.currency,
      detail: (t.detail ?? {}) as Record<string, unknown>,
      pan4: String(t.pan4 ?? ""),
    })) as Array<SpendRow & { pan4: string }>,
    (row) => (row as SpendRow & { pan4: string }).pan4,
  );
  const currencyByPan = new Map<string, string>();
  for (const t of rows) {
    const pan4 = String(t.pan4 ?? "").trim();
    if (pan4 && !currencyByPan.has(pan4)) currencyByPan.set(pan4, String(t.currency ?? "USD"));
  }

  const result: BybitCard[] = stored.map((s) => {
    const pan4 = String(s.pan4 ?? "").trim();
    const derived = perCard.get(pan4);
    const fromNumber = brandFromNumber(String(s.full_number ?? ""));
    return {
      id: s.id,
      pan4,
      brand: fromNumber ?? String(s.brand ?? "Visa"),
      currency: String(s.currency ?? currencyByPan.get(pan4) ?? "USD"),
      status: String(s.status ?? "active"),
      name: s.name ?? undefined,
      fullNumber: s.full_number ?? undefined,
      cvv: s.cvv ?? undefined,
      expiry: s.expiry ?? undefined,
      txnCount: derived?.totalTxns ?? 0,
      spend: derived?.spend ?? 0,
      lastUsed: derived?.lastUsed ?? 0,
      virtual: true,
    };
  });


  // Only cards explicitly added by the admin are shown.
  return result.sort((a, b) => b.lastUsed - a.lastUsed);
}

export async function createCard(input: {
  pan4: string;
  brand: string;
  currency: string;
  status: string;
  name?: string;
  fullNumber?: string;
  cvv?: string;
  expiry?: string;
  userId: string;
  accountId?: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any).from("bybit_cards").insert({
    pan4: input.pan4,
    brand: input.brand,
    currency: input.currency,
    status: input.status,
    name: input.name,
    full_number: input.fullNumber,
    cvv: input.cvv,
    expiry: input.expiry,
    created_by: input.userId,
    account_id: input.accountId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteCard(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any).from("bybit_cards").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateCard(input: {
  id: string;
  pan4: string;
  brand: string;
  currency: string;
  status: string;
  name?: string;
  fullNumber?: string;
  cvv?: string;
  expiry?: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any)
    .from("bybit_cards")
    .update({
      pan4: input.pan4,
      brand: input.brand,
      currency: input.currency,
      status: input.status,
      name: input.name,
      full_number: input.fullNumber,
      cvv: input.cvv,
      expiry: input.expiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

/* ============================ Convert (تحويل عملة) ============================ */

const CONVERT_ACCOUNTS = ["eb_convert_funding", "eb_convert_uta", "eb_convert_spot"] as const;

function convertError(e: unknown): Error {
  const msg = String((e as any)?.message ?? e);
  if (msg.includes("10005")) {
    return new Error(
      "مفتاح API ناقصه صلاحية التداول الفوري. من Bybit → API Management → عدّل المفتاح وفعّل «تداول موحّد – تداول» (Unified Trading → Trade / Spot) بالإضافة إلى «تبادل» (Exchange)، ثم احفظ وأعد المحاولة. صلاحية «سجل عمليات تبادل الأصول» وحدها لا تكفي للتحويل.",
    );
  }
  return e instanceof Error ? e : new Error(msg);
}

/** Bybit's convert account type differs per key/account; try the known ones. */
async function convertCall(
  method: "GET" | "POST",
  path: string,
  params: Record<string, unknown>,
  creds: Creds,
) {
  let last: unknown = null;
  for (const accountType of CONVERT_ACCOUNTS) {
    try {
      return await call(method, path, { ...params, accountType }, creds);
    } catch (e) {
      last = e;
      const msg = String((e as any)?.message ?? e);
      // permission / unsupported account type → try the next one
      if (!msg.includes("10005") && !msg.includes("181") && !msg.includes("params error")) throw convertError(e);
    }
  }
  throw convertError(last);
}

export type ConvertCoin = { coin: string; balance: number; toCoins: string[] };

export async function convertCoinList(accountId?: string, coin?: string): Promise<ConvertCoin[]> {
  const creds = await getCreds(accountId);
  const params: Record<string, unknown> = {};
  if (coin) { params["coin"] = coin; params["side"] = 1; }
  const res = await convertCall("GET", "/v5/asset/exchange/query-coin-list", params, creds);
  const rows = Array.isArray(res?.coins) ? res.coins : [];
  return rows.map((r: any) => ({
    coin: String(r?.coin ?? ""),
    balance: num(r?.balance),
    toCoins: Array.isArray(r?.toCoins) ? r.toCoins.map((c: any) => String(c)) : [],
  })).filter((r: ConvertCoin) => r.coin);
}

export type ConvertQuote = {
  quoteTxId: string;
  fromCoin: string;
  toCoin: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
  expiredTime: number;
};

export async function convertQuote(input: {
  accountId?: string; fromCoin: string; toCoin: string; amount: string;
}): Promise<ConvertQuote> {
  const creds = await getCreds(input.accountId);
  const res = await convertCall("POST", "/v5/asset/exchange/quote-apply", {
    fromCoin: input.fromCoin,
    toCoin: input.toCoin,
    requestCoin: input.fromCoin,
    requestAmount: input.amount,
  }, creds);
  const r = (res as any)?.result ?? res;
  const fromAmount = num(r?.fromAmount) || Number(input.amount) || 0;
  const toAmount = num(r?.toAmount);
  const rate = num(r?.exchangeRate) || (fromAmount > 0 && toAmount > 0 ? toAmount / fromAmount : 0);
  return {
    quoteTxId: String(r?.quoteTxId ?? ""),
    fromCoin: String(r?.fromCoin ?? input.fromCoin),
    toCoin: String(r?.toCoin ?? input.toCoin),
    fromAmount,
    toAmount,
    rate,
    expiredTime: Number(r?.expiredTime ?? 0) || 0,
  };
}

export async function convertExecute(quoteTxId: string, accountId?: string) {
  const creds = await getCreds(accountId);
  let res: any;
  try {
    res = await call("POST", "/v5/asset/exchange/convert-execute", { quoteTxId }, creds);
  } catch (e) {
    throw convertError(e);
  }
  return { quoteTxId: String(res?.quoteTxId ?? quoteTxId), status: String(res?.exchangeStatus ?? "init") };
}

export async function convertStatus(quoteTxId: string, accountId?: string) {
  const creds = await getCreds(accountId);
  const res = await convertCall("GET", "/v5/asset/exchange/convert-result-query", { quoteTxId }, creds);
  const r = res?.result ?? res;
  return {
    status: String(r?.exchangeStatus ?? "init"),
    fromCoin: String(r?.fromCoin ?? ""),
    toCoin: String(r?.toCoin ?? ""),
    fromAmount: num(r?.fromAmount),
    toAmount: num(r?.toAmount),
  };
}

/* ============================ السجل المركزي للمعاملات ============================ */

export type LedgerRow = {
  id: string;
  accountId: string | null;
  accountName: string;
  kind: string;
  direction: "in" | "out";
  refId: string;
  title: string;
  amount: number;
  currency: string;
  fee: number;
  status: string;
  time: number;
  detail: Record<string, string | number | boolean | null>;
};

export type LedgerPage = {
  rows: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
};

type LedgerInsert = {
  account_id: string | null;
  kind: string;
  direction: "in" | "out";
  ref_id: string;
  title: string;
  amount: number;
  currency: string;
  fee: number;
  status: string;
  occurred_at: string;
  detail: Record<string, string | number | boolean | null>;
};

const iso = (ms: number) => new Date(ms > 0 ? ms : Date.now()).toISOString();

async function upsertLedger(rows: LedgerInsert[]) {
  const clean = rows.filter((r) => r.ref_id);
  if (!clean.length) return 0;
  const db = await admin();
  let saved = 0;
  for (let i = 0; i < clean.length; i += 500) {
    const { error } = await db
      .from("bybit_ledger")
      .upsert(clean.slice(i, i + 500), { onConflict: "account_id,kind,ref_id" });
    if (error) console.error("bybit_ledger upsert failed:", error.message);
    else saved += Math.min(500, clean.length - i);
  }
  // Work-sheet layer: link the freshly mirrored movements to the open shift.
  // Never modifies ledger rows; failures here must not break the sync.
  try {
    const work = await import("./work-assign.server");
    await work.autoAssignLedger(db);
  } catch (e) {
    console.error("work auto-assign skipped:", (e as Error)?.message);
  }
  return saved;
}

/** Mirrors every movement type of one account into the central ledger. */
export async function syncAccountLedger(accountId: string): Promise<number> {
  const db = await admin();
  const rows: LedgerInsert[] = [];

  // 1) card movements (purchases / refunds / fees) from the archive.
  // READ-ONLY: never refresh/modify the account's own archive from here.
  // Incremental: the first run for an account walks the whole archive, later
  // runs only re-read rows at or after the newest already-mirrored movement
  // (minus a 48h overlap window so late status changes — pending -> success —
  // are still picked up). Nothing is skipped, but a routine sync no longer
  // re-reads and re-upserts tens of thousands of unchanged rows.
  const { data: wm } = await db
    .from("bybit_ledger")
    .select("occurred_at")
    .eq("account_id", accountId)
    .in("kind", ["card", "refund"])
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sinceMs = wm?.occurred_at ? new Date(wm.occurred_at).getTime() - 48 * 3600_000 : 0;

  const CHUNK = 1000;
  const HARD_CAP = 200_000;
  for (let from = 0; from < HARD_CAP; from += CHUNK) {
    let cardQ = db
      .from("bybit_card_txns")
      .select("txn_id, merchant, amount, currency, status, txn_time, pan4, txn_type, detail")
      .eq("account_id", accountId);
    if (sinceMs > 0) cardQ = cardQ.gte("txn_time", sinceMs);
    const { data: cards } = await cardQ
      .order("txn_time", { ascending: false })
      .range(from, from + CHUNK - 1);
    const batch = cards ?? [];
    for (const c of batch) {
      const t = mapStoredRow(c);
      // This is the exact normalized row shown by the account's internal log.
      // Do not derive a second status specifically for the central ledger.
      const status = t.status;
      const isRefund = status === "refund";
      const src = (t.detail ?? {}) as Record<string, any>;
      const { raw: _raw, ...original } = src;
      // Fee comes straight from the source account's own fee field (totalFees).
      const rawSrc = (src["raw"] ?? {}) as Record<string, any>;
      const feeRaw =
        src["totalFees"] ?? rawSrc["totalFees"] ?? src["feeAmount"] ?? rawSrc["foreignTransactionFee"] ?? null;
      const feeVal = feeRaw === null || feeRaw === undefined || feeRaw === "" ? 0 : num(feeRaw);
      rows.push({
        account_id: accountId,
        kind: isRefund ? "refund" : "card",
        direction: isRefund ? "in" : "out",
        ref_id: String(t.id),
        title: t.merchant,
        amount: isRefund ? Math.abs(t.amount) : -Math.abs(t.amount),
        currency: t.currency,
        fee: feeVal,
        status,
        occurred_at: iso(t.time),
        // Full original payload (minus the oversized raw blob) so the central
        // ledger can render exactly the same fields as the source account.
        detail: sanitize({
          ...original,
          pan4: t.pan4 ?? null,
          totalFees: feeRaw,
          foreignTransactionFee: src["foreignTransactionFee"] ?? rawSrc["foreignTransactionFee"] ?? null,
          type: t.type ?? null,
          merchantName: src["merchantName"] ?? t.merchant ?? null,
          basicAmount: src["basicAmount"] ?? t.amount,
          basicCurrency: src["basicCurrency"] ?? t.currency,
        }),
      });
    }
    if (batch.length < CHUNK) break;
  }


  // 2) on-chain + internal transfers + P2P (live from Bybit)
  const [onchain, internal, p2p] = await Promise.allSettled([
    fetchOnChain(accountId),
    fetchInternal(accountId),
    fetchP2P(accountId),
  ]);

  const pushAssets = (list: AssetRow[], kind: string) => {
    for (const a of list) {
      if (!a.id) continue;
      rows.push({
        account_id: accountId,
        kind,
        direction: a.direction,
        ref_id: a.id,
        title: `${a.coin}${a.chain ? ` · ${a.chain}` : ""}`,
        amount: a.amount,
        currency: a.coin || "USDT",
        fee: a.fee,
        status: a.status,
        occurred_at: iso(a.time),
        detail: { address: a.address, chain: a.chain },
      });
    }
  };

  if (onchain.status === "fulfilled") {
    pushAssets(onchain.value.deposits, "deposit");
    pushAssets(onchain.value.withdrawals, "withdraw");
  }
  if (internal.status === "fulfilled") {
    pushAssets(internal.value.deposits, "internal_in");
    pushAssets(internal.value.withdrawals, "internal_out");
  }
  if (p2p.status === "fulfilled") {
    for (const o of p2p.value) {
      if (!o.id) continue;
      rows.push({
        account_id: accountId,
        kind: o.side === "sell" ? "p2p_sell" : "p2p_buy",
        direction: o.side === "sell" ? "out" : "in",
        ref_id: o.id,
        title: `P2P ${o.coin}/${o.fiat}${o.counterparty ? ` · ${o.counterparty}` : ""}`,
        amount: o.side === "sell" ? -Math.abs(o.quantity) : Math.abs(o.quantity),
        currency: o.coin || "USDT",
        fee: 0,
        status: o.status,
        occurred_at: iso(o.time),
        detail: { fiatAmount: o.amount, fiat: o.fiat, price: o.price, counterparty: o.counterparty ?? null },
      });
    }
  }

  return upsertLedger(rows);
}

/** Runs the ledger sync for every linked account. */
export async function syncAllLedger(): Promise<{ saved: number; accounts: number }> {
  const accounts = await listAccounts();
  const results = await Promise.all(
    accounts.map(async (a) => {
      try {
        return await syncAccountLedger(a.id);
      } catch {
        return 0;
      }
    }),
  );
  return { saved: results.reduce((s, n) => s + n, 0), accounts: accounts.length };
}

const GROUP_KINDS: Record<string, string[]> = {
  txns: ["card", "refund"],
  onchain: ["deposit", "withdraw"],
  internal: ["internal_in", "internal_out"],
  p2p: ["p2p_buy", "p2p_sell"],
};

/** Sub-filters inside a group map straight to one ledger kind. */
const SUB_KIND: Record<string, string> = {
  deposit: "deposit",
  withdraw: "withdraw",
  internal_in: "internal_in",
  internal_out: "internal_out",
  p2p_buy: "p2p_buy",
  p2p_sell: "p2p_sell",
};

/** One page of the central ledger across all accounts. */
export async function fetchLedgerPage(opts: {
  group?: string;
  status?: string;
  accountId?: string;
  page?: number;
  pageSize?: number;
}): Promise<LedgerPage> {
  const db = await admin();
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 10), 200);
  const page = Math.max(opts.page ?? 1, 1);
  const from = (page - 1) * pageSize;
  const group = GROUP_KINDS[opts.group ?? "txns"] ? (opts.group as string) : "txns";
  const status = opts.status && opts.status !== "all" ? opts.status : "all";

  const accounts = await listAccounts();
  const nameById = new Map(accounts.map((a, i) => [a.id, `${a.name} (فيزا ${a.sortOrder || i + 1})`]));

  const base = () => {
    let q: any = db.from("bybit_ledger");
    return q;
  };

  const applyScope = (q: any, g: string, st: string) => {
    let out = q;
    if (opts.accountId) out = out.eq("account_id", opts.accountId);
    if (g === "txns" && st === "refund") out = out.eq("kind", "refund");
    else if (g === "txns" && (st === "success" || st === "failed")) out = out.eq("kind", "card").eq("status", st);
    else if (g !== "txns" && SUB_KIND[st] && (GROUP_KINDS[g] as string[]).includes(SUB_KIND[st]!))
      out = out.eq("kind", SUB_KIND[st]!);
    else out = out.in("kind", GROUP_KINDS[g] as string[]);
    return out;
  };

  // One round trip: the page rows and the row count for the same scope. The
  // previous version issued ~15 extra exact-count scans per request (one per
  // group and sub-filter) even though the UI shows no counters — that alone
  // made every ledger read scan the whole table more than a dozen times.
  const { data, error, count } = (await applyScope(base().select("*", { count: "exact" }), group, status)
    .order("occurred_at", { ascending: false })
    .range(from, from + pageSize - 1)) as {
    data: any[] | null;
    error: { message: string } | null;
    count: number | null;
  };
  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  const total = Number(count ?? (data?.length ?? 0));

  return {
    rows: (data ?? []).map((r: any) => ({
      id: r.id,
      accountId: r.account_id ?? null,
      accountName: nameById.get(r.account_id) ?? "حساب محذوف",
      kind: r.kind,
      direction: r.direction === "in" ? "in" : "out",
      refId: r.ref_id,
      title: r.title || "—",
      amount: num(r.amount),
      currency: r.currency ?? "USD",
      fee: num(r.fee),
      status: r.status ?? "",
      time: new Date(r.occurred_at).getTime(),
      detail: (r.detail ?? {}) as Record<string, string | number | boolean | null>,
    })),
    total,
    page,
    pageSize,
    counts,
  };
}


/**
 * Same spend/fee rules as a single visa account, aggregated over every account
 * currently present in the system. Each account is summed with the shared spend
 * engine (identical to its own card), then the results are added together, so a
 * newly added account is included automatically and a removed one drops out.
 */
export async function computeSpendAllAccounts() {
  const { dayStart, monthStart } = spendWindows(await bybitNow().catch(() => Date.now()));
  const accounts = await listAccounts();
  const totals = { daySpend: 0, monthSpend: 0, dayFees: 0, monthFees: 0 };
  for (const acc of accounts) {
    const t = await computeSpend(acc.id, dayStart, monthStart);
    totals.daySpend += t.daySpend;
    totals.monthSpend += t.monthSpend;
    totals.dayFees += t.dayFees;
    totals.monthFees += t.monthFees;
  }
  return { ...totals, accounts: accounts.length, dayStart, monthStart };
}

/**
 * Automatic card-brand reference: the brand of every pan4 is derived from the
 * card records of the main account (full number IIN first, then the stored
 * brand). No manual per-row choice anywhere in the UI.
 */
export async function cardBrandsByPan(): Promise<Record<string, string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("bybit_cards")
    .select("pan4,brand,full_number");
  const out: Record<string, string> = {};
  for (const c of (data ?? []) as any[]) {
    const pan4 = String(c.pan4 ?? "").trim();
    if (!pan4) continue;
    const brand = brandFromNumber(String(c.full_number ?? "")) ?? String(c.brand ?? "").trim();
    if (brand) out[pan4] = brand;
  }
  return out;
}
