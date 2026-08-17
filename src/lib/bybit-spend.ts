/**
 * ONE spend engine for every Bybit account and every API path.
 *
 * Bybit archives a single card purchase more than once:
 *   - SIDE_QUERY_AUTH       → the authorisation row (tradeStatus "0")
 *   - SIDE_QUERY_FINANCIAL  → the settlement row for the SAME purchase
 *     (tradeStatus "1"), with a different txnId
 *   - SIDE_QUERY_REFUND     → reversal rows
 *
 * Summing raw rows therefore counts the same purchase twice whenever both its
 * authorisation and its settlement are archived — that is the real source of a
 * total that reads a few dollars above the account's actual spend. Nothing is
 * added or subtracted by hand anywhere: the fix is to collapse each purchase to
 * ONE row before summing, and to sum a USD-denominated amount.
 *
 * Rules (identical for daily, monthly and per-card spend, all accounts):
 *  1. identity  — rows that describe the same purchase share one identity
 *                 (paymentId/orderNo when Bybit exposes it, else txnId).
 *  2. winner    — per identity keep the settled row when it exists, otherwise
 *                 the still-authorised row. So an unsettled authorisation is
 *                 counted exactly once (today's spend stays complete) and a
 *                 settled purchase is never counted twice.
 *  3. excluded  — refunds/reversals, failed rows and zero amounts never count.
 *  4. currency  — the amount is read from the USD-denominated field Bybit
 *                 returns; no rounding is applied at any step.
 *  5. window    — a row belongs to a window purely by its own timestamp.
 */

export type SpendRow = {
  txnId: string;
  amount: number;
  time: number;
  status?: unknown;
  type?: unknown;
  currency?: unknown;
  detail?: Record<string, unknown> | null;
};

const STABLE_USD = new Set(["USD", "USDT", "USDC", "DAI", "FDUSD", "TUSD", "BUSD"]);

/** Bybit `side` values that describe a refund/reversal rather than a purchase. */
const REFUND_SIDES = new Set(["3", "5", "6", "7", "10", "11"]);

const numeric = (v: unknown) => {
  const n = Number(v ?? NaN);
  return Number.isFinite(n) ? n : null;
};

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Stable identity for a purchase across the auth/settlement/page duplicates. */
export function spendIdentity(row: SpendRow): string {
  const d = row.detail ?? {};
  const payment = text(d["paymentId"]).trim();
  if (payment) return `p:${payment}`;
  const txn = text(d["txnId"]).trim() || text(row.txnId).trim();
  if (txn) return `t:${txn}`;
  return `c:${row.time}|${text(d["merchantName"])}|${Math.abs(row.amount)}`;
}

type Kind = "settled" | "authorised" | "excluded";

/** Classifies a row using Bybit's own status fields, never a stored guess. */
export function spendKind(row: SpendRow): Kind {
  const d = row.detail ?? {};
  const side = text(d["side"]) || text(row.type);
  if (REFUND_SIDES.has(side)) return "excluded";

  const stored = text(row.status).toLowerCase();
  if (stored === "refund" || stored === "failed") return "excluded";

  const trade = text(d["tradeStatus"]);
  if (trade === "3") return "excluded"; // reversed
  if (trade === "2") return "excluded"; // failed / declined
  if (trade === "1") return "settled";
  if (trade === "0") return "authorised";

  // No raw trade status stored (older archive rows): trust the mapped status.
  return stored === "success" ? "settled" : "excluded";
}

/**
 * USD amount of a purchase, taken from the USD-denominated field Bybit returns.
 * Returns null when no field is USD-denominated, so a foreign-currency figure is
 * never summed as if it were dollars.
 */
export function spendUsd(row: SpendRow): number | null {
  const d = row.detail ?? {};
  const candidates: Array<[unknown, unknown]> = [
    [d["basicAmount"], d["basicCurrency"]],
    [d["transactionAmount"], d["transactionCurrency"]],
    [row.amount, row.currency],
    [d["localAmount"], d["localCurrency"]],
  ];
  for (const [rawAmount, rawCurrency] of candidates) {
    const amount = numeric(rawAmount);
    if (amount === null || amount === 0) continue;
    const currency = text(rawCurrency).toUpperCase();
    if (!currency || !STABLE_USD.has(currency)) continue;
    return Math.abs(amount);
  }
  return null;
}

export type SpendTotals = {
  daySpend: number;
  monthSpend: number;
  /** Purchases that actually contributed to the totals. */
  countedTxns: number;
  /** Rows whose currency is not USD-denominated, so they are reported instead of guessed. */
  skippedNonUsd: number;
  lastTxnTime: number;
};

/**
 * Collapses duplicates, then sums each window independently.
 * The same function backs every account and every caller.
 */
export function sumSpend(rows: Iterable<SpendRow>, dayStart: number, monthStart: number): SpendTotals {
  const winners = new Map<string, SpendRow>();
  let lastTxnTime = 0;

  for (const row of rows) {
    const time = Number(row.time ?? 0);
    if (time > lastTxnTime) lastTxnTime = time;

    const kind = spendKind(row);
    if (kind === "excluded") continue;

    const id = spendIdentity(row);
    const current = winners.get(id);
    if (!current) {
      winners.set(id, row);
      continue;
    }
    // Settlement wins over authorisation; between equals keep the earlier
    // timestamp so a purchase stays inside the window it was made in.
    const currentKind = spendKind(current);
    if (kind === "settled" && currentKind !== "settled") winners.set(id, row);
    else if (kind === currentKind && time && time < Number(current.time ?? 0)) winners.set(id, row);
  }

  let daySpend = 0;
  let monthSpend = 0;
  let countedTxns = 0;
  let skippedNonUsd = 0;

  for (const row of winners.values()) {
    const usd = spendUsd(row);
    if (usd === null) {
      skippedNonUsd += 1;
      continue;
    }
    if (usd <= 0) continue;
    const time = Number(row.time ?? 0);
    countedTxns += 1;
    if (time >= monthStart) monthSpend += usd;
    if (time >= dayStart) daySpend += usd;
  }

  return { daySpend, monthSpend, countedTxns, skippedNonUsd, lastTxnTime };
}

/** Per-card spend uses the very same engine, so card and account totals agree. */
export function sumSpendByCard(rows: Iterable<SpendRow>, pan4Of: (row: SpendRow) => string) {
  const grouped = new Map<string, SpendRow[]>();
  for (const row of rows) {
    const pan4 = pan4Of(row).trim();
    if (!pan4) continue;
    const list = grouped.get(pan4) ?? [];
    list.push(row);
    grouped.set(pan4, list);
  }
  const out = new Map<string, { spend: number; countedTxns: number; totalTxns: number; lastUsed: number }>();
  for (const [pan4, list] of grouped) {
    const totals = sumSpend(list, 0, 0);
    out.set(pan4, {
      spend: totals.monthSpend, // monthStart = 0 → every archived purchase
      countedTxns: totals.countedTxns,
      totalTxns: list.length,
      lastUsed: totals.lastTxnTime,
    });
  }
  return out;
}
