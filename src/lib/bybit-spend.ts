/**
 * ONE spend engine for every Bybit account and every API path.
 *
 * Pipeline (the only pipeline in the project):
 *
 *   Bybit raw rows
 *        ↓ normalize            (readRow)
 *        ↓ canonical identity   (getCanonicalTransactionIdentity)
 *        ↓ deduplicate          (sumSpend: one winner per identity)
 *        ↓ auth/settlement      (settlement wins, otherwise authorisation)
 *        ↓ status validation    (spendKind)
 *        ↓ currency validation  (usdCandidates → skippedNonUsd)
 *        ↓ gross / fee / net    (canonicalAmounts)
 *        ↓ daily / monthly / per-card spend
 *
 * Bybit archives a single card purchase more than once:
 *   - SIDE_QUERY_AUTH       → the authorisation row (tradeStatus "0")
 *   - SIDE_QUERY_FINANCIAL  → the settlement row for the SAME purchase
 *     (tradeStatus "1"), usually with a DIFFERENT txnId
 *   - SIDE_QUERY_REFUND     → reversal rows
 *
 * Raw rows are never deleted — they stay in the archive for auditing and for the
 * transaction list. Only canonical transactions enter any total.
 *
 * Rules (identical for daily, monthly and per-card spend, all accounts):
 *  1. identity  — rows that describe the same purchase share one canonical
 *                 identity (paymentId / orderNo / orderId / referenceId / refId,
 *                 and only as a last resort the record-level txnId).
 *  2. winner    — per identity keep the settled row when it exists, otherwise
 *                 the still-authorised row. An unsettled authorisation is
 *                 counted exactly once and a settled purchase is never counted
 *                 twice, even when the two copies carry different txnIds.
 *  3. excluded  — refunds/reversals, failed rows and zero amounts never count.
 *  4. currency  — the amount is read from a USD-denominated field Bybit itself
 *                 returns; no exchange rate is ever guessed, no rounding.
 *  5. window    — a row belongs to a window purely by its own transaction
 *                 timestamp, never by the time the data reached the server.
 */

export type SpendRow = {
  txnId: string;
  amount: number;
  time: number;
  status?: unknown;
  type?: unknown;
  currency?: unknown;
  pan4?: unknown;
  merchant?: unknown;
  detail?: Record<string, unknown> | null;
};

const STABLE_USD = new Set(["USD", "USDT", "USDC", "DAI", "FDUSD", "TUSD", "BUSD"]);

/** Bybit `side` values that describe a refund/reversal rather than a purchase. */
const REFUND_SIDES = new Set(["3", "5", "6", "7", "10", "11"]);

/**
 * Business identifiers Bybit exposes for one purchase, in priority order.
 * The authorisation copy and the settlement copy of the same purchase share the
 * first of these that the account actually returns; `txnId` is a record id, not
 * a business id, so it is only the last resort.
 */
const IDENTITY_KEYS = ["paymentId", "orderNo", "orderId", "referenceId", "refId"] as const;

/** Placeholder values Bybit sends for "no identifier" — never an identity. */
const JUNK_IDS = new Set(["", "0", "-", "--", "null", "undefined", "none", "n/a", "na", "false"]);

const numeric = (v: unknown) => {
  const n = Number(v ?? NaN);
  return Number.isFinite(n) ? n : null;
};

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));

const cleanId = (v: unknown) => {
  const s = text(v).trim();
  return JUNK_IDS.has(s.toLowerCase()) ? "" : s;
};

/**
 * THE canonical identity of a purchase — the single source of truth for
 * "are these two raw records the same transaction?". Used by the spend engine,
 * per-card spend, reports and the audit view alike.
 */
export function getCanonicalTransactionIdentity(row: SpendRow): string {
  const d = row.detail ?? {};
  for (const key of IDENTITY_KEYS) {
    const v = cleanId(d[key]);
    if (v) return `${key}:${v}`;
  }
  const txn = cleanId(d["txnId"]) || cleanId(row.txnId);
  if (txn) return `txnId:${txn}`;
  // Nothing identifying at all: fall back to the purchase's own coordinates so
  // the same row arriving from two pages still collapses into one transaction.
  return `composite:${row.time}|${text(d["merchantName"] ?? d["merchName"])}|${Math.abs(row.amount)}`;
}

/** Backwards-compatible alias; there is only ONE identity function. */
export const spendIdentity = getCanonicalTransactionIdentity;

type Kind = "settled" | "authorised" | "excluded";

/**
 * Outcome of ONE raw card record, read only from Bybit's own fields.
 * The single rule used by the archive, the central ledger, the shift sheet and
 * every spend total.
 *  - "reversed": Bybit «معكوسة» — the authorisation was voided, nothing was
 *    charged (tradeStatus "4", or a REVERS/VOID status text).
 *  - "refund":   money returned (refund side, tradeStatus "3"/"5", REFUND text).
 *  - "failed":   declined / cancelled.
 */
export type CardOutcome = "ok" | "reversed" | "refund" | "failed";

export function cardRecordOutcome(tradeStatus: unknown, side: unknown): CardOutcome {
  const ts = text(tradeStatus).trim();
  const up = ts.toUpperCase();
  if (REFUND_SIDES.has(text(side).trim())) return "refund";
  if (ts === "4" || /REVERS|VOID/.test(up)) return "reversed";
  if (ts === "3" || ts === "5" || /REFUND|CHARGEBACK/.test(up)) return "refund";
  if (ts === "2" || /FAIL|DECLIN|REJECT|CANCEL|EXPIRE/.test(up)) return "failed";
  return "ok";
}

/**
 * Hung checkout retry («معكوسة»). When a PayPal/TikTok checkout hangs, the
 * merchant fires the SAME charge again seconds later and Bybit voids the first
 * authorisation. Bybit's API keeps returning that first record as a plain
 * pending purchase (tradeStatus "0"), so the void is recognised by its shape:
 * an unsettled authorisation followed, on the same card, by another purchase
 * at the same merchant for the exact same amount within this window.
 */
export const HANG_RETRY_WINDOW_MS = 20_000;

export type HangCandidate = {
  id: string;
  pan4: unknown;
  merchant: unknown;
  amount: number;
  time: number;
  tradeStatus: unknown;
  side: unknown;
};

/** Ids of the voided first attempts. Pure; shared by archive, ledger, sheet and spend. */
export function findHangReversals(rows: Iterable<HangCandidate>, windowMs = HANG_RETRY_WINDOW_MS): Set<string> {
  const groups = new Map<string, HangCandidate[]>();
  for (const r of rows) {
    if (!r.id || !Number.isFinite(r.time) || r.time <= 0) continue;
    if (cardRecordOutcome(r.tradeStatus, r.side) !== "ok") continue;
    const cents = Math.round(Math.abs(Number(r.amount) || 0) * 100);
    if (!cents) continue;
    const key = `${text(r.pan4).trim()}|${text(r.merchant).trim().toUpperCase()}|${cents}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const out = new Set<string>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.time - b.time);
    for (let i = 0; i < list.length - 1; i++) {
      const first = list[i];
      if (text(first.tradeStatus).trim() !== "0") continue; // settled purchases are never voided
      const next = list.slice(i + 1).find((r) => r.id !== first.id && r.time > first.time);
      if (next && next.time - first.time <= windowMs) out.add(first.id);
    }
  }
  return out;
}

function hangCandidateOfSpendRow(row: SpendRow): HangCandidate {
  const d = row.detail ?? {};
  return {
    id: text(row.txnId),
    pan4: row.pan4 ?? d["pan4"],
    merchant: row.merchant ?? d["merchantName"] ?? d["merchName"],
    amount: Math.abs(Number(row.amount) || 0),
    time: Number(row.time ?? 0),
    tradeStatus: d["tradeStatus"],
    side: text(d["side"]) || text(row.type),
  };
}

/** Classifies a row using Bybit's own status fields, never a stored guess. */
export function spendKind(row: SpendRow): Kind {
  const d = row.detail ?? {};
  const side = text(d["side"]) || text(row.type);
  if (cardRecordOutcome(d["tradeStatus"], side) !== "ok") return "excluded";

  const stored = text(row.status).toLowerCase();
  if (stored === "refund" || stored === "failed" || stored === "reversed") return "excluded";

  const trade = text(d["tradeStatus"]);
  if (trade === "1") return "settled";
  if (trade === "0") return "authorised";

  // No raw trade status stored (older archive rows): trust the mapped status.
  return stored === "success" ? "settled" : "excluded";
}

/** A business identity (paymentId/orderNo/...) — not a record id or a guess. */
const isBusinessIdentity = (id: string) => IDENTITY_KEYS.some((k) => id.startsWith(`${k}:`));

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
  for (const key of ["foreignTxnFee", "foreignTransactionFee", "feeAmount", "fee", "handlingFee", "totalFees"]) {
    const n = numeric(d[key]);
    if (n === null || n === 0) continue;
    seen.add(Math.abs(n));
  }
  let total = 0;
  for (const n of seen) total += n;
  return total;
}

/** USD-denominated amounts reported for a purchase; `base` is the preferred one. */
function usdCandidates(row: SpendRow): { base: number | null; amounts: number[]; currency: string } {
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
  const reported = text(d["basicCurrency"] ?? d["transactionCurrency"] ?? row.currency ?? d["localCurrency"]).toUpperCase();
  return { base, amounts: usdAmounts, currency: usdCurrency ? "USD" : reported };
}

/**
 * THE official financial figures of one transaction. Every screen (transaction
 * details, reports, dashboard) reads these instead of recomputing amounts, so
 * the number shown for a purchase is exactly the number that enters spend.
 *
 * `spendUsd` is the amount Bybit actually charged to the card (fee included,
 * exactly as Bybit counts it against the card limits) — never a re-derived or
 * fee-adjusted figure. It is null when Bybit reported no USD-denominated
 * amount; nothing is guessed, the row is surfaced as `skippedNonUsd` instead.
 */
export type CanonicalAmounts = {
  grossAmount: number | null;
  fee: number;
  netAmount: number | null;
  currency: string;
  spendUsd: number | null;
};

export function canonicalAmounts(row: SpendRow): CanonicalAmounts {
  const d = row.detail ?? {};
  const { base, amounts: usdAmounts, currency } = usdCandidates(row);
  if (base === null) {
    return { grossAmount: null, fee: 0, netAmount: null, currency, spendUsd: null };
  }

  const close = (a: number, b: number) => Math.abs(a - b) < 0.005;
  const netField = numeric(d["transactionAmount"]);
  const netFieldCur = text(d["transactionCurrency"]).toUpperCase();
  const usdNetField =
    netField !== null && netField !== 0 && STABLE_USD.has(netFieldCur) ? Math.abs(netField) : null;

  const explicitFee = spendFeeUsd(row);
  // Nonsense fee (>= the amount itself) is ignored rather than trusted.
  const fee = explicitFee > 0 && explicitFee < base ? explicitFee : 0;

  // `base` (basicAmount) is the total Bybit charged the card. Some rows report
  // it fee-free instead, and then another USD field equals base + fee: that
  // larger figure is the charged total.
  const grossFromFee = usdAmounts.find((a) => close(a, base + fee));
  const gross = fee > 0 && grossFromFee !== undefined ? grossFromFee : base;
  const netCandidate =
    usdNetField !== null && usdNetField <= gross + 0.005 ? usdNetField : gross - fee;
  const netAmount = netCandidate > 0 ? netCandidate : gross;

  // Spend is the charged total: the fee is reported, never deducted from it.
  return { grossAmount: gross, fee, netAmount, currency, spendUsd: gross };
}


/**
 * Fee actually charged inside this purchase, in USD.
 * Thin read of {@link canonicalAmounts} — kept so existing callers keep working.
 */
export function spendFeeChargedUsd(row: SpendRow): number {
  return canonicalAmounts(row).fee;
}

/**
 * Actual purchase value in USD, excluding every fee charged inside it.
 * Thin read of {@link canonicalAmounts}; null when no field is USD-denominated.
 */
export function spendUsd(row: SpendRow): number | null {
  return canonicalAmounts(row).spendUsd;
}
/**
 * THE single definition of the Bybit monthly spend cycle.
 *
 * Bybit does not reset spend on the 1st: the LAST calendar day of a month is the
 * first day of the next cycle. So a 31-day month opens its new cycle on the
 * 31st, a 30-day month on the 30th, February on the 28th (29th in a leap year).
 * The last day is always derived from the calendar, never hard-coded.
 *
 * Boundaries are UTC midnight (Bybit timestamps are epoch-ms UTC) and the window
 * is half-open: `periodStart <= time < periodEnd`, so a transaction belongs to
 * exactly one cycle and no millisecond can fall between two cycles.
 */
export type MonthlySpendPeriod = { periodStart: number; periodEnd: number };

/** UTC midnight of the last calendar day of the given year/month (0-based). */
function cycleAnchor(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, lastDay, 0, 0, 0, 0);
}

export function getMonthlySpendPeriod(nowMs: number): MonthlySpendPeriod {
  const n = new Date(nowMs);
  const year = n.getUTCFullYear();
  const month = n.getUTCMonth();
  const thisAnchor = cycleAnchor(year, month);
  if (nowMs >= thisAnchor) {
    return { periodStart: thisAnchor, periodEnd: cycleAnchor(year, month + 1) };
  }
  return { periodStart: cycleAnchor(year, month - 1), periodEnd: thisAnchor };
}


export type SpendTotals = {
  daySpend: number;
  monthSpend: number;
  /** Fees charged inside the purchases of each window (fees only, never the purchase value). */
  dayFees: number;
  monthFees: number;
  /** Purchases that actually contributed to the totals. */
  countedTxns: number;
  /** Rows whose currency is not USD-denominated, so they are reported instead of guessed. */
  skippedNonUsd: number;
  lastTxnTime: number;
};

/** One canonical transaction, resolved from every raw record that describes it. */
export type CanonicalTxn = {
  canonicalId: string;
  winner: SpendRow;
  kind: Exclude<Kind, "excluded">;
  /** raw records that collapsed into this transaction (winner included) */
  rawTxnIds: string[];
  amounts: CanonicalAmounts;
};

/**
 * Raw rows → canonical transactions. No row is mutated or dropped from the
 * archive here; this only decides which record represents each purchase.
 */
export function canonicalize(rows: Iterable<SpendRow>): {
  transactions: Map<string, CanonicalTxn>;
  excluded: Array<{ row: SpendRow; canonicalId: string; reason: string }>;
  lastTxnTime: number;
} {
  const transactions = new Map<string, CanonicalTxn>();
  const excluded: Array<{ row: SpendRow; canonicalId: string; reason: string }> = [];
  let lastTxnTime = 0;
  const seenRaw = new Set<string>();
  const list = [...rows];
  const hangVoided = findHangReversals(list.map(hangCandidateOfSpendRow));

  for (const row of list) {
    const time = Number(row.time ?? 0);
    if (time > lastTxnTime) lastTxnTime = time;

    const canonicalId = getCanonicalTransactionIdentity(row);
    const kind = hangVoided.has(text(row.txnId)) ? "excluded" : spendKind(row);
    if (kind === "excluded") {
      excluded.push({ row, canonicalId, reason: "refund/reversed/failed" });
      continue;
    }

    // The very same raw record can be returned by two pages of one endpoint.
    const rawKey = `${canonicalId}|${text(row.detail?.["txnId"]) || text(row.txnId)}|${kind}|${time}`;
    if (seenRaw.has(rawKey)) continue;
    seenRaw.add(rawKey);

    const current = transactions.get(canonicalId);
    if (!current) {
      transactions.set(canonicalId, {
        canonicalId,
        winner: row,
        kind,
        rawTxnIds: [text(row.txnId)],
        amounts: canonicalAmounts(row),
      });
      continue;
    }
    current.rawTxnIds.push(text(row.txnId));
    // Settlement wins over authorisation; between equals keep the earlier
    // timestamp so a purchase stays inside the window it was made in.
    const promote =
      (kind === "settled" && current.kind !== "settled") ||
      (kind === current.kind && time > 0 && time < Number(current.winner.time ?? 0));
    if (promote) {
      current.winner = row;
      current.kind = kind;
      current.amounts = canonicalAmounts(row);
    }
  }

  // A reversal record that shares the business id of a purchase that was only
  // authorised (never settled) voids that purchase: Bybit shows it struck
  // through as «معكوسة» and nothing was charged.
  for (const ex of excluded) {
    if (!isBusinessIdentity(ex.canonicalId)) continue;
    const d = ex.row.detail ?? {};
    if (cardRecordOutcome(d["tradeStatus"], text(d["side"]) || text(ex.row.type)) === "failed") continue;
    const txn = transactions.get(ex.canonicalId);
    if (txn && txn.kind === "authorised") transactions.delete(ex.canonicalId);
  }

  return { transactions, excluded, lastTxnTime };
}

/**
 * Collapses duplicates into canonical transactions, then sums each window
 * independently from the transaction's OWN timestamp.
 * The monthly window is the Bybit cycle from {@link getMonthlySpendPeriod} and is
 * half-open: `monthStart <= time < monthEnd`.
 * The same function backs every account and every caller.
 */
export function sumSpend(
  rows: Iterable<SpendRow>,
  dayStart: number,
  monthStart: number,
  monthEnd: number = Number.POSITIVE_INFINITY,
): SpendTotals {
  const { transactions, lastTxnTime } = canonicalize(rows);

  let daySpend = 0;
  let monthSpend = 0;
  let dayFees = 0;
  let monthFees = 0;
  let countedTxns = 0;
  let skippedNonUsd = 0;

  for (const txn of transactions.values()) {
    const { spendUsd: usd, fee } = txn.amounts;
    if (usd === null) {
      skippedNonUsd += 1;
      continue;
    }
    if (usd <= 0) continue;
    const time = Number(txn.winner.time ?? 0);
    countedTxns += 1;
    if (time >= monthStart && time < monthEnd) {
      monthSpend += usd;
      monthFees += fee;
    }
    if (time >= dayStart) {
      daySpend += usd;
      dayFees += fee;
    }
  }

  return { daySpend, monthSpend, dayFees, monthFees, countedTxns, skippedNonUsd, lastTxnTime };
}

/**
 * Per-card spend uses the very same engine, so card and account totals agree.
 * `spend` is the lifetime archived spend; `monthSpend` is the current Bybit
 * monthly cycle when a `period` is supplied.
 */
export function sumSpendByCard(
  rows: Iterable<SpendRow>,
  pan4Of: (row: SpendRow) => string,
  period?: MonthlySpendPeriod,
) {
  const grouped = new Map<string, SpendRow[]>();
  for (const row of rows) {
    const pan4 = pan4Of(row).trim();
    if (!pan4) continue;
    const list = grouped.get(pan4) ?? [];
    list.push(row);
    grouped.set(pan4, list);
  }
  const out = new Map<
    string,
    { spend: number; monthSpend: number; countedTxns: number; totalTxns: number; lastUsed: number }
  >();
  for (const [pan4, list] of grouped) {
    const lifetime = sumSpend(list, 0, 0);
    const cycle = period ? sumSpend(list, 0, period.periodStart, period.periodEnd) : null;
    out.set(pan4, {
      spend: lifetime.monthSpend, // monthStart = 0, no end → every archived purchase
      monthSpend: cycle ? cycle.monthSpend : lifetime.monthSpend,
      countedTxns: lifetime.countedTxns,
      totalTxns: list.length,
      lastUsed: lifetime.lastTxnTime,
    });
  }
  return out;
}


/**
 * Audit view: explains, per raw row, why it did or did not reach spend.
 * Contains only amounts, ids and statuses that already live in the archive —
 * never credentials or API secrets — so it is safe to log in production.
 */
export type SpendAuditEntry = {
  rawTxnId: string;
  canonicalId: string;
  side: string;
  tradeStatus: string;
  counted: boolean;
  isWinner: boolean;
  reason: string;
  grossAmount: number | null;
  fee: number;
  netAmount: number | null;
  currency: string;
  spendUsd: number | null;
  time: number;
};

export function auditSpend(
  rows: SpendRow[],
  dayStart = 0,
  monthStart = 0,
  monthEnd: number = Number.POSITIVE_INFINITY,
) {
  const { transactions, excluded } = canonicalize(rows);
  const winnerRawIds = new Set<string>();
  for (const t of transactions.values()) winnerRawIds.add(`${t.canonicalId}|${text(t.winner.txnId)}`);

  const entries: SpendAuditEntry[] = rows.map((row) => {
    const canonicalId = getCanonicalTransactionIdentity(row);
    const d = row.detail ?? {};
    const kind = spendKind(row);
    const isWinner = winnerRawIds.has(`${canonicalId}|${text(row.txnId)}`);
    const amounts = canonicalAmounts(row);
    const rowTime = Number(row.time ?? 0);
    const inWindow = rowTime >= monthStart && rowTime < monthEnd;
    let reason = "";
    if (kind === "excluded") reason = "excluded: refund/reversed/failed";
    else if (!isWinner) reason = "duplicate of the canonical transaction";
    else if (amounts.spendUsd === null) reason = "no USD-denominated amount (skippedNonUsd)";
    else if (!inWindow) reason = "outside the requested window";
    else reason = kind === "settled" ? "counted (settlement)" : "counted (authorisation, not settled yet)";
    return {
      rawTxnId: text(row.txnId),
      canonicalId,
      side: text(d["side"]) || text(row.type),
      tradeStatus: text(d["tradeStatus"]),
      counted: isWinner && kind !== "excluded" && amounts.spendUsd !== null && inWindow,
      isWinner,
      reason,
      grossAmount: amounts.grossAmount,
      fee: amounts.fee,
      netAmount: amounts.netAmount,
      currency: amounts.currency,
      spendUsd: amounts.spendUsd,
      time: Number(row.time ?? 0),
    };
  });

  return {
    entries,
    canonicalCount: transactions.size,
    excludedCount: excluded.length,
    totals: sumSpend(rows, dayStart, monthStart, monthEnd),
  };
}
