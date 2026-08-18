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
 * Fees embedded in a purchase (foreign transaction fee, handling fee, ...).
 * Duplicated fee fields (the same number under two names) count once.
 */
export function spendFeeUsd(row: SpendRow): number {
  const d = row.detail ?? {};
  // Some accounts report the fee in the local (non-USD) currency. Deducting it
  // from a USD amount would corrupt the total, so it is ignored there.
  const feeCurrency = text(d["feeCurrency"] ?? d["foreignTxnFeeCurrency"]).toUpperCase();
  if (feeCurrency && !STABLE_USD.has(feeCurrency)) return 0;

  const seen = new Set<number>();
  for (const key of ["foreignTxnFee", "feeAmount", "fee", "handlingFee"]) {
    const n = numeric(d[key]);
    if (n === null || n === 0) continue;
    seen.add(Math.abs(n));
  }
  let total = 0;
  for (const n of seen) total += n;
  return total;
}

/**
 * Actual purchase value in USD, excluding every fee charged inside it.
 * Bybit sometimes reports a fee-inclusive total (16.54 with a 0.32 fee) and
 * sometimes the net amount already separated from the fee (16.22 + 0.32).
 * The fee is only subtracted when the chosen figure is fee-inclusive, so no
 * amount is ever deducted twice. Returns null when no field is USD-denominated.
 */
export function spendUsd(row: SpendRow): number | null {
  const d = row.detail ?? {};
  const candidates: Array<[unknown, unknown]> = [
    [d["basicAmount"], d["basicCurrency"]],
    [d["transactionAmount"], d["transactionCurrency"]],
    [row.amount, row.currency],
    // Bybit's own USD conversion of a foreign-currency purchase. Used only when
    // the fields above are not USD-denominated, so the rate is always Bybit's.
    [d["settleAmount"], d["settleCurrency"]],
    [d["usdAmount"], "USD"],
    [d["localAmount"], d["localCurrency"]],
  ];

  const usdAmounts: number[] = [];
  let base: number | null = null;
  for (const [rawAmount, rawCurrency] of candidates) {
    const amount = numeric(rawAmount);
    if (amount === null || amount === 0) continue;
    const currency = text(rawCurrency).toUpperCase();
    if (!currency || !STABLE_USD.has(currency)) continue;
    const abs = Math.abs(amount);
    usdAmounts.push(abs);
    if (base === null) base = abs;
  }
  // Gross/total fields are fee-inclusive by definition; keep them as comparison
  // points only, never as the preferred base.
  const usdCurrency = usdAmounts.length > 0;
  for (const key of ["grossAmount", "netAmount"]) {
    const n = numeric(d[key]);
    if (n !== null && n !== 0 && usdCurrency) usdAmounts.push(Math.abs(n));
  }

  if (base === null) return null;

  let fee = spendFeeUsd(row);
  if (fee <= 0) {
    // No explicit fee field. Bybit still charges a fee inside the total on some
    // rows: the charged total sits a few cents above the transaction amount.
    // That gap IS the fee, so the smaller (fee-free) figure is the purchase.
    const net = numeric(d["transactionAmount"]);
    const netCur = text(d["transactionCurrency"]).toUpperCase();
    if (net !== null && net !== 0 && STABLE_USD.has(netCur)) {
      const netAbs = Math.abs(net);
      const gap = base - netAbs;
      // Only a fee-sized gap counts (never a different purchase or a rounding
      // artefact), so nothing is deducted when the two figures agree.
      if (gap > 0.0049 && gap <= base * 0.15) return netAbs;
    }
    return base;
  }
  // Nonsense fee (>= the amount itself) is ignored rather than trusted.
  if (fee >= base) return base;

  const close = (a: number, b: number) => Math.abs(a - b) < 0.005;

  // The API already separated the purchase from its fee: base + fee equals a
  // reported total, so base is the real purchase value — do not deduct again.
  if (usdAmounts.some((a) => close(a, base! + fee))) return base;
  // Some other field already equals base - fee → that is the fee-free amount.
  const net = usdAmounts.find((a) => close(a, base! - fee));
  if (net !== undefined) return net;
  // Otherwise base is the fee-inclusive total: strip the fees out of it.
  const stripped = base - fee;
  return stripped > 0 ? stripped : base;
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
