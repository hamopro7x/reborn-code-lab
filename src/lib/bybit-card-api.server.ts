import { createHmac } from "crypto";
import { getCreds } from "./bybit-account.server";
import { cardRowKey } from "./bybit-card-mapper";
import type { Creds } from "./bybit-account.server";
import { BYBIT_BASE_URL as BASE, BYBIT_RECV_WINDOW as RECV, sleep } from "./bybit-runtime";
import {
  sumSpend,
  sumSpendByCard,
  auditSpend,
  cardRecordOutcome,
  isCardReversalEvent,
  type SpendRow,
  cryptoSoldOf,
  cardLinkIds,
  findLinkedReversals,
  REVERSAL_LINK_WINDOW_MS,
  type LinkCandidate,
  cardPurchaseGroup,
  cardFilterMatches,
  LEDGER_CARD_FILTERS,
  legacyReversalUnproven,
  durableCardReversal,
} from "./bybit-spend";
import { currentBybitCycle } from "./monthly-cycle.server";
import { cardCache, cardInflight } from "./bybit-cache.server";

export const CARD_PATH = "/v5/card/transaction/query-asset-records";

export {
  CARD_QUERY_TYPES,
  cardRecordRank,
  isUnsupportedCardTypeError,
  mergeCardTypeResults,
  isLateSettlementRecord,
  preferRecord,
} from "./bybit-card-records";
import { CARD_QUERY_TYPES, preferRecord, isLateSettlementRecord } from "./bybit-card-records";

export async function callCardPage(params: Record<string, unknown>, creds: Creds) {
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
    if (json.retCode === 0) return { ...(json.result ?? {}), data: (json.result?.data ?? []).map((row: any) => ({ ...row, __observedAt: new Date(Number(ts)).toISOString() })) };
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

/** Storage key of ONE raw Bybit record (not of a purchase).
 * Raw authorisation and settlement records are kept side by side for auditing;
 * deciding that two records are the SAME purchase is the job of
 * `getCanonicalTransactionIdentity` in ./bybit-spend, which every total uses.
 */

/** Fetch every card record ever recorded on the account, for every Bybit query type. */

export async function fetchCardPages(maxRows: number, creds: Creds, sinceMs?: number, budgetMs = 20_000): Promise<any[]> {
  const merged = new Map<string, { row: any; sourcePriority: number; updatedAt: number }>();
  const pageSize = 100; // Bybit caps this endpoint at 100 per page (larger values silently return 10)
  const maxPages = Math.max(1, Math.ceil(maxRows / pageSize));
  // Wall-clock budget: an unbounded page walk could keep one request busy for
  // minutes and starve every other visitor of the same worker.
  const deadline = Date.now() + budgetMs;
  let successfulTypes = 0;
  let lastError: unknown;

  // Walk REFUND first, then FINANCIAL, then AUTH. The time budget used to run
  // out inside the long AUTH walk, so reversals («معكوسة») were never read and
  // the stale authorisation snapshot stayed "success". Priority stays by type.
  const order = [...CARD_QUERY_TYPES.entries()].reverse();
  for (const [typeIndex, type] of order) {
    if (Date.now() > deadline) break;
    try {
      successfulTypes++;
      for (let page = 1; page <= maxPages && Date.now() < deadline; page++) {

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
          if (preferRecord(current, r, typeIndex, updatedAt)) {
            merged.set(k, { row: r, sourcePriority: typeIndex, updatedAt });
          }
        }
        const totalCount = Number(result?.totalCount ?? 0);
        const pageNo = Number(result?.pageNo ?? page);
        const returnedPageSize = Number(result?.pageSize ?? pageSize);
        const reachedCycleStart =
          sinceMs !== undefined && rows.some((row: any) => Number(row?.txnCreate ?? 0) < sinceMs);
        if (reachedCycleStart) break;
        if (!rows.length || (totalCount > 0 && pageNo * returnedPageSize >= totalCount)) break;
        await sleep(250);
      }
    } catch (error) {
      successfulTypes--;
      lastError = error;
      // A type may be unsupported for this key; keep the successful types, but say so.
      console.warn(`bybit card type ${type} skipped:`, (error as Error)?.message ?? error);
    }
    await sleep(400);
  }

  // Returning [] when every provider request failed made a linked account look
  // as if it genuinely had no transactions and prevented the caller from
  // reporting/retrying the real problem.
  if (!successfulTypes && lastError) throw lastError;

  return [...merged.values()]
    .map(({ row }) => row)
    .filter((row) => !isLateSettlementRecord(row))
    .sort((a, b) => Number(b?.txnCreate ?? 0) - Number(a?.txnCreate ?? 0));
}

export async function callCard(limit: number, accountId?: string, creds?: Creds, sinceMs?: number): Promise<any[]> {
  const key = accountId ?? "default";
  const filterRows = (rows: any[]) => {
    const { periodStart, periodEnd } = currentBybitCycle();
    const start = Math.max(periodStart, sinceMs ?? periodStart);
    return rows.filter((row) => Number(row?.txnCreate) >= start && Number(row?.txnCreate) < periodEnd);
  };
  const cached = cardCache.get(key);
  // Short TTL: a settlement can land seconds after its authorisation, and a
  // cached authorisation must never be treated as the final record.
  if (cached && Date.now() - cached.at < 10_000) return filterRows(cached.rows);

  const running = cardInflight.get(key);
  if (running) return running.then(filterRows);
  const p = fetchCardPages(Math.max(limit, 100), creds ?? (await getCreds(accountId)), sinceMs)
    .then((rows) => {
      cardCache.set(key, { at: Date.now(), rows });
      return rows;
    })
    .finally(() => {
      cardInflight.delete(key);
    });
  cardInflight.set(key, p);
  return p.then(filterRows);
}
