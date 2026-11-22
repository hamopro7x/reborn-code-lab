import { mapLimit } from "./bybit-concurrency.server";
import { SETTLEMENT_COPY_FILTER } from "./bybit-settlement";

import { admin, call, getCreds, listAccounts } from "./bybit-account.server";


import { brandFromNumber } from "./bybit-cards.server";
import { BYBIT_BASE_URL as BASE, num } from "./bybit-runtime";
import { sumSpend, auditSpend, isCardReversalEvent, type SpendRow } from "./bybit-spend";
import { currentBybitCycle } from "./monthly-cycle.server";

import { archivedCardReadable } from "./bybit-confirmation";
import { spendCache } from "./bybit-cache.server";


const STABLES = new Set(["USDT", "USDC", "USD", "DAI", "FDUSD", "TUSD", "BUSD"]);

// "Is this row real spending?" now lives in ./bybit-spend (spendKind/spendUsd)
// so daily spend, monthly spend and per-card spend cannot drift apart, and a
// purchase archived as both an authorisation and a settlement is counted once.


/* The card-limit "reset window" probe used to define a SECOND month start that
 * no caller used. There is now exactly one definition of dayStart/monthStart —
 * `spendWindows()` below (UTC) — shared by dashboard, reports, monthly spend,
 * per-card spend and transaction filters. */



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


/**
 * Fixed spend cycles, computed independently of each other. UTC only — never a
 * local, device or Cairo timezone, so summer/winter time cannot shift a window:
 *  - daily  : today 00:00 UTC
 *  - monthly: the Bybit cycle from getMonthlySpendPeriod() — it opens on the LAST
 *    calendar day of the month at 00:00 UTC and is half-open
 *    (monthStart <= time < monthEnd). There is no other definition anywhere,
 *    and the monthly transaction cycle uses exactly this window.
 */

export function spendWindows(nowMs: number) {
  const n = new Date(nowMs);
  const DAY = 24 * 3600_000;
  let dayStart = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 0);
  if (nowMs < dayStart) dayStart -= DAY;


  const { periodStart, periodEnd } = currentBybitCycle(nowMs);

  return { dayStart: Math.max(dayStart, periodStart), monthStart: periodStart, monthEnd: periodEnd };
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

const SPEND_CACHE_MS = 30_000;

export function computeSpend(
  accountId: string | undefined,
  dayStart: number,
  monthStart: number,
  monthEnd: number = Number.POSITIVE_INFINITY,
) {
  const { periodStart, periodEnd } = currentBybitCycle();
  dayStart = Math.max(dayStart, periodStart);
  monthStart = Math.max(monthStart, periodStart);
  monthEnd = Math.min(monthEnd, periodEnd);
  const key = `${accountId ?? "*"}|${dayStart}|${monthStart}|${monthEnd}`;
  const now = Date.now();
  const hit = spendCache.get(key);
  if (hit && now - hit.at < SPEND_CACHE_MS) return hit.value;
  const value = computeSpendUncached(accountId, dayStart, monthStart, monthEnd);
  spendCache.set(key, { at: now, value });
  value.catch(() => spendCache.delete(key));
  if (spendCache.size > 200) {
    for (const [k, v] of spendCache) if (now - v.at >= SPEND_CACHE_MS) spendCache.delete(k);
  }
  return value;
}

async function computeSpendUncached(
  accountId: string | undefined,
  dayStart: number,
  monthStart: number,
  monthEnd: number = Number.POSITIVE_INFINITY,
) {
  const collected: SpendRow[] = [];

  const seenRows = new Set<string>();
  try {
    const db = await admin();
    const from = Math.min(dayStart, monthStart);
    const CHUNK = 1000;
    for (let offset = 0; offset < 200_000; offset += CHUNK) {
      let query = (db as any)
        .from("bybit_card_txns")
        .select("txn_id, account_id, created_at, confirmed_at, amount, currency, txn_time, status, txn_type, pan4, merchant, detail")
        .gte("txn_time", from)
        .or(SETTLEMENT_COPY_FILTER)
        .order("txn_time", { ascending: false })
        .order("txn_id", { ascending: true })
        .range(offset, offset + CHUNK - 1);
      if (accountId) query = query.eq("account_id", accountId);
      const { data } = await query;
      const rows: any[] = data ?? [];
      for (const row of rows) {
        // Guards against a row appearing in two pages when the archive grows
        // between requests; the spend engine de-duplicates purchases separately.
        const rowKey = `${row.account_id ?? ""}|${row.txn_id ?? ""}|${row.txn_time ?? ""}`;
        if (seenRows.has(rowKey)) continue;
        seenRows.add(rowKey);
        if (isCardReversalEvent(row.detail?.side || row.txn_type) || archivedCardReadable(row)) collected.push(row);
      }
      if (rows.length < CHUNK) break;
    }
  } catch {
    /* balances should still render if the archive is temporarily unavailable */
  }

  const engineRows: SpendRow[] = collected.map((row: any) => ({
    scope: row.account_id ?? "",
    txnId: String(row.txn_id ?? ""),
    amount: num(row.amount),
    time: Number(row.txn_time ?? 0),
    status: row.detail?.projectedStatus ?? row.status,
    type: row.txn_type,
    currency: row.currency,
    pan4: row.pan4,
    merchant: row.merchant,
    detail: (row.detail ?? {}) as Record<string, unknown>,
  }));

  const totals = sumSpend(engineRows, dayStart, monthStart, monthEnd);

  // Opt-in audit trail (BYBIT_SPEND_AUDIT=1): raw rows → canonical transactions
  // → counted spend. Ids/amounts/statuses only, never credentials.
  if (process.env["BYBIT_SPEND_AUDIT"] === "1") {
    const audit = auditSpend(engineRows, dayStart, monthStart, monthEnd);
    console.log(
      "[bybit-spend audit]",
      JSON.stringify({
        account: accountId ?? "all",
        rawRows: engineRows.length,
        canonical: audit.canonicalCount,
        excluded: audit.excludedCount,
        counted: totals.countedTxns,
        skippedNonUsd: totals.skippedNonUsd,
        monthSpend: totals.monthSpend,
        daySpend: totals.daySpend,
        sample: audit.entries.slice(0, 25),
      }),
    );
  }

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
  const { dayStart, monthStart, monthEnd } = spendWindows(await bybitNow().catch(() => Date.now()));
  const archivedSpend = await computeSpend(accountId, dayStart, monthStart, monthEnd);
  const daySpend = archivedSpend.daySpend;

  return {
    totalUsd: total,
    monthSpend: archivedSpend.monthSpend,
    daySpend,
    monthFees: archivedSpend.monthFees,
    dayFees: archivedSpend.dayFees,
    dayStart,
    monthStart,
    monthEnd,

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

export async function computeSpendAllAccounts() {
  const { dayStart, monthStart, monthEnd } = spendWindows(await bybitNow().catch(() => Date.now()));
  const accounts = await listAccounts();
  const totals = { daySpend: 0, monthSpend: 0, dayFees: 0, monthFees: 0 };
  await mapLimit(accounts, 4, async (acc) => {
    const t = await computeSpend(acc.id, dayStart, monthStart, monthEnd);
    totals.daySpend += t.daySpend;
    totals.monthSpend += t.monthSpend;
    totals.dayFees += t.dayFees;
    totals.monthFees += t.monthFees;
  });
  return { ...totals, accounts: accounts.length, dayStart, monthStart, monthEnd };
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

export function clearBybitSpendCache() { spendCache.clear(); }
