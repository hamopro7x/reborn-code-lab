/**
 * OKX accounts. They live in `bybit_accounts` with provider = 'okx' and their
 * movements are written to the same central ledger (`bybit_ledger`) with the
 * same kinds as Bybit (internal_in/internal_out/deposit/withdraw), so the
 * central record, shift linking and employee sheets treat them identically.
 * OKX has no public card or P2P history API, so only asset movements exist.
 */
import {
  okxSign,
  encodeOkxSecret,
  decodeOkxSecret,
  mapOkxDeposit,
  mapOkxWithdrawal,
  OkxError,
  type OkxCreds,
  type OkxAssetRow,
} from "./okx-core";
import { currentBybitCycle, currentBybitRows } from "./monthly-cycle.server";
import { mapOkxHistory, okxHistoryCursor, type OkxHistoryKind, type OkxInstrument } from "./okx-history";

const BASE = "https://www.okx.com";

export type OkxAccount = {
  id: string;
  name: string;
  uid: string | null;
  createdAt: string;
  sortOrder: number;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const missingProvider = (e: any) =>
  Boolean(e) && (String(e.code) === "42703" || /provider/i.test(String(e.message ?? "")));

/* ---------------- HTTP ---------------- */

export async function okxCall(
  method: "GET" | "POST",
  path: string,
  params: Record<string, string | number | undefined>,
  c: OkxCreds,
): Promise<any[]> {
  const clean = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  const qs = method === "GET" ? new URLSearchParams(clean.map(([k, v]) => [k, String(v)])).toString() : "";
  const requestPath = qs ? `${path}?${qs}` : path;
  const body = method === "POST" ? JSON.stringify(Object.fromEntries(clean)) : "";
  const ts = new Date().toISOString();
  const res = await fetch(BASE + requestPath, {
    method,
    headers: {
      "OK-ACCESS-KEY": c.key,
      "OK-ACCESS-SIGN": okxSign(c.secret, ts, method, requestPath, body),
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": c.passphrase,
      "Content-Type": "application/json",
    },
    body: body || undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new OkxError(`HTTP_${res.status}`, `HTTP ${res.status}`);
  }
  if (String(j?.code ?? "") !== "0") throw new OkxError(String(j?.code ?? res.status), String(j?.msg ?? ""));
  return Array.isArray(j?.data) ? j.data : [];
}

/* ---------------- accounts ---------------- */

export async function listOkxAccounts(): Promise<OkxAccount[]> {
  const db = await admin();
  const { data, error } = await db
    .from("bybit_accounts")
    .select("id, name, uid, created_at, sort_order")
    .eq("provider", "okx")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name ?? "OKX",
    uid: r.uid ?? null,
    createdAt: r.created_at,
    sortOrder: Number(r.sort_order ?? 0),
  }));
}

async function okxCreds(accountId: string): Promise<OkxCreds> {
  const db = await admin();
  const { data: acc } = await db.from("bybit_accounts").select("provider").eq("id", accountId).maybeSingle();
  if (acc?.provider !== "okx") throw new OkxError("OKX_KEYS_MISSING", "");
  const { data } = await db.rpc("bybit_account_get_keys", { p_account_id: accountId });
  const row = Array.isArray(data) ? data[0] : data;
  const extra = decodeOkxSecret(row?.api_secret);
  if (!row?.api_key || !extra) throw new OkxError("OKX_KEYS_MISSING", "");
  return { key: row.api_key, ...extra };
}

/** Validates the key (read permission) and returns the OKX UID. */
export async function testOkxCreds(c: OkxCreds): Promise<{ uid: string | null; label: string | null }> {
  const cfg = await okxCall("GET", "/api/v5/account/config", {}, c);
  const row = cfg[0] ?? {};
  return { uid: row.uid ? String(row.uid) : null, label: row.label ? String(row.label) : null };
}

export async function createOkxAccount(input: OkxCreds & { userId: string; name?: string }) {
  const creds = { key: input.key, secret: input.secret, passphrase: input.passphrase };
  const { uid } = await testOkxCreds(creds);
  const db = await admin();
  const existing = await listOkxAccounts();
  const nextOrder = Math.max(0, ...existing.map((a) => a.sortOrder)) + 1;
  const name = (input.name ?? "").trim() || (uid ? `OKX · UID ${uid}` : `OKX · ${input.key.slice(0, 4)}${input.key.slice(-4)}`);
  const { data, error } = await db
    .from("bybit_accounts")
    .insert({ name, uid, created_by: input.userId, sort_order: nextOrder, provider: "okx" })
    .select("id")
    .single();
  if (error) {
    if (missingProvider(error)) throw new OkxError("OKX_SETUP_MISSING", "");
    throw new Error(error.message);
  }
  const { error: kErr } = await db.rpc("bybit_account_set_keys", {
    p_account_id: data.id,
    p_key: input.key,
    p_secret: encodeOkxSecret(input.secret, input.passphrase),
    p_by: input.userId,
  });
  if (kErr) {
    await db.from("bybit_accounts").delete().eq("id", data.id);
    throw new Error(kErr.message);
  }
  return { id: data.id as string, name, uid };
}

export async function deleteOkxAccount(accountId: string) {
  const db = await admin();
  const { error } = await db.from("bybit_accounts").delete().eq("id", accountId).eq("provider", "okx");
  if (error) throw new Error(error.message);
}

export async function renameOkxAccount(accountId: string, name: string) {
  const db = await admin();
  const { error } = await db.from("bybit_accounts").update({ name }).eq("id", accountId).eq("provider", "okx");
  if (error) throw new Error(error.message);
}

/* ---------------- balances ---------------- */

export type OkxCoin = { coin: string; funding: number; trading: number; total: number; usd: number };

export async function fetchOkxBalances(accountId: string): Promise<{ coins: OkxCoin[]; totalUsd: number }> {
  const c = await okxCreds(accountId);
  const [funding, trading] = await Promise.allSettled([
    okxCall("GET", "/api/v5/asset/balances", {}, c),
    okxCall("GET", "/api/v5/account/balance", {}, c),
  ]);
  if (funding.status === "rejected" && trading.status === "rejected") throw funding.reason;
  // Official overview valuation includes funding, trading and Earn; never add it
  // to the component balances or infer an undocumented Pay balance from it.
  let overviewUsd: number | null = null;
  try {
    const valuation = await okxCall("GET", "/api/v5/asset/asset-valuation", { ccy: "USD" }, c);
    const raw = valuation[0]?.totalBal;
    const value = Number(raw);
    if (raw !== undefined && raw !== null && raw !== "" && Number.isFinite(value) && value >= 0) overviewUsd = value;
  } catch {
    // Keep the available component balances if overview valuation is unavailable.
  }
  const map = new Map<string, OkxCoin>();
  const get = (coin: string) => {
    let row = map.get(coin);
    if (!row) map.set(coin, (row = { coin, funding: 0, trading: 0, total: 0, usd: 0 }));
    return row;
  };
  if (funding.status === "fulfilled") {
    for (const b of funding.value) {
      const row = get(String(b.ccy ?? ""));
      row.funding += Number(b.bal ?? 0) || 0;
    }
  }
  let totalUsd = 0;
  if (trading.status === "fulfilled") {
    const acct = trading.value[0] ?? {};
    totalUsd += Number(acct.totalEq ?? 0) || 0;
    for (const d of acct.details ?? []) {
      const row = get(String(d.ccy ?? ""));
      row.trading += Number(d.cashBal ?? d.eq ?? 0) || 0;
      row.usd += Number(d.eqUsd ?? 0) || 0;
    }
  }
  const stable = new Set(["USDT", "USDC", "USD", "USDG", "FDUSD", "DAI"]);
  const coins = [...map.values()]
    .map((r) => {
      const total = r.funding + r.trading;
      const usd = stable.has(r.coin) ? total : r.usd;
      return { ...r, total, usd };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => (a.coin === "USDT" ? -1 : b.coin === "USDT" ? 1 : b.usd - a.usd));
  if (funding.status === "fulfilled") {
    totalUsd += coins.filter((r) => stable.has(r.coin)).reduce((s, r) => s + r.funding, 0);
  }
  return { coins, totalUsd: overviewUsd ?? totalUsd };
}

/* ---------------- movements ---------------- */

async function walk(
  c: OkxCreds,
  path: string,
  type: "3" | "4",
  deep: boolean,
): Promise<any[]> {
  const { periodStart } = currentBybitCycle();
  const out: any[] = [];
  let after: string | undefined;
  for (let page = 0; page < (deep ? 10 : 1); page++) {
    const rows = await okxCall("GET", path, { type, limit: 100, after }, c);
    out.push(...rows);
    if (rows.length < 100) break;
    const oldest = Math.min(...rows.map((r: any) => Number(r.ts ?? 0)).filter((n) => n > 0));
    if (!Number.isFinite(oldest) || oldest < periodStart) break;
    after = String(oldest);
  }
  return out;
}

export type OkxMovements = {
  internal: { deposits: OkxAssetRow[]; withdrawals: OkxAssetRow[] };
  onchain: { deposits: OkxAssetRow[]; withdrawals: OkxAssetRow[] };
};

export async function fetchOkxMovements(accountId: string, deep = false): Promise<OkxMovements> {
  const c = await okxCreds(accountId);
  // Sequential: deposit/withdrawal history allow 6 requests per second.
  const inDep = await walk(c, "/api/v5/asset/deposit-history", "3", deep);
  const inWd = await walk(c, "/api/v5/asset/withdrawal-history", "3", deep);
  const chDep = await walk(c, "/api/v5/asset/deposit-history", "4", deep);
  const chWd = await walk(c, "/api/v5/asset/withdrawal-history", "4", deep);
  const sort = (rows: OkxAssetRow[]) =>
    currentBybitRows(rows.filter((r) => r.id)).sort((a, b) => b.time - a.time);
  return {
    internal: {
      deposits: sort(inDep.map((d) => mapOkxDeposit(d, true))),
      withdrawals: sort(inWd.map((w) => mapOkxWithdrawal(w, true))),
    },
    onchain: {
      deposits: sort(chDep.map((d) => mapOkxDeposit(d, false))),
      withdrawals: sort(chWd.map((w) => mapOkxWithdrawal(w, false))),
    },
  };
}

/** Same ledger row shape as Bybit asset movements. */
export function okxLedgerRows(accountId: string, m: OkxMovements) {
  const rows: any[] = [];
  const push = (list: OkxAssetRow[], kind: string) => {
    for (const a of list) {
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
        occurred_at: new Date(a.time > 0 ? a.time : Date.now()).toISOString(),
        detail: { address: a.address, chain: a.chain, txId: a.txId || null, provider: "okx" },
      });
    }
  };
  push(m.internal.deposits, "internal_in");
  push(m.internal.withdrawals, "internal_out");
  push(m.onchain.deposits, "deposit");
  push(m.onchain.withdrawals, "withdraw");
  return rows;
}

/* ---------------- background sync ---------------- */

/** Read-only detail views; never project bills/orders into the transfer ledger. */
export async function fetchOkxHistory(accountId: string, kind: OkxHistoryKind, instrument: OkxInstrument, after?: string) {
  const c = await okxCreds(accountId);
  const { periodStart, periodEnd } = currentBybitCycle();
  const start = kind === "funding" ? Math.max(periodStart, Date.now() - 30 * 86400_000) : periodStart;
  const path = kind === "funding" ? "/api/v5/asset/bills" : kind === "bills" ? "/api/v5/account/bills-archive" : "/api/v5/trade/orders-history-archive";
  const raw = await okxCall("GET", path, {
    limit: 100, after,
    ...(kind === "funding" ? {} : { begin: start, end: Math.min(periodEnd, Date.now()), ...(kind === "orders" ? { instType: instrument } : {}) }),
  }, c);
  const rows = raw.map((r) => mapOkxHistory(r, kind)).filter((r) => r.id && r.time >= start && r.time < periodEnd);
  const last = raw[raw.length - 1];
  const lastTime = Number(last?.[kind === "orders" ? "cTime" : "ts"] ?? 0);
  const cursor = lastTime >= start ? okxHistoryCursor(raw, kind) : null;
  return {
    rows, nextCursor: cursor === after ? null : cursor,
    periodLabel: `${new Date(start).toLocaleDateString("en-GB", { timeZone: "Africa/Cairo" })} — ${new Date().toLocaleDateString("en-GB", { timeZone: "Africa/Cairo" })}`,
  };
}

let inflight: Promise<number> | null = null;
let lastRecent = 0;
let lastDeep = 0;
const RECENT_EVERY_MS = 15_000;
const DEEP_EVERY_MS = 5 * 60_000;

/** One OKX pass at a time; recent = newest page, deep = walk the current cycle. */
export function syncAllOkx(deep = false): Promise<number> {
  if (inflight) return inflight;
  const now = Date.now();
  const wantDeep = deep || now - lastDeep >= DEEP_EVERY_MS;
  if (!wantDeep && now - lastRecent < RECENT_EVERY_MS) return Promise.resolve(0);
  lastRecent = now;
  if (wantDeep) lastDeep = now;
  inflight = (async () => {
    const accounts = await listOkxAccounts();
    if (!accounts.length) return 0;
    const bybit = await import("./bybit.server");
    let saved = 0;
    for (const a of accounts) {
      try {
        saved += await bybit.saveLedgerRows(okxLedgerRows(a.id, await fetchOkxMovements(a.id, wantDeep)));
      } catch (e) {
        console.error(`okx sync skipped for ${a.id}:`, (e as Error)?.message);
      }
    }
    return saved;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
