import { createHmac } from "crypto";
import { getCreds } from "./bybit-account.server";
import type { Creds } from "./bybit-account.server";

import { cardRowKey } from "./bybit-card-mapper";

import { BYBIT_BASE_URL as BASE, BYBIT_RECV_WINDOW as RECV, sleep } from "./bybit-runtime";
import { isExplicitReversal } from "./bybit-spend";
import { currentBybitCycle } from "./monthly-cycle.server";


import { cardCache, cardInflight } from "./bybit-cache.server";

export const CARD_PATH = "/v5/card/transaction/query-asset-records";

export const CARD_QUERY_TYPES = [
  "SIDE_QUERY_AUTH",
  "SIDE_QUERY_AUTH_ALL",
  "SIDE_QUERY_FINANCIAL_ALL",
  "SIDE_QUERY_FINANCIAL_REFUND",
  "SIDE_QUERY_AUTH_REVERSAL",
];

/** How final a raw record's state is: a later sync never downgrades a reversal to pending/success. */

export function cardRecordRank(t: any): number {
  if (isExplicitReversal(t?.tradeStatus ?? t?.status, t?.side)) return 3;
  const ts = String(t?.tradeStatus ?? t?.status ?? "");
  if (ts === "2") return 2;
  if (ts === "1") return 1;
  return 0;
}

/**
 * True when Bybit rejected the request itself (e.g. a query type this key or
 * API version does not support) — not a network, auth or rate-limit problem.
 * Only SIDE_QUERY_AUTH/FINANCIAL/REFUND are publicly documented; the other
 * types are best-effort and are skipped when rejected.
 */

const TRANSIENT_OR_AUTH_CODES = new Set(["10002", "10003", "10004", "10005", "10006", "10016", "10018"]);

export function isUnsupportedCardTypeError(err: unknown): boolean {
  const message = String((err as Error)?.message ?? err ?? "");
  const m = /^Bybit (\d+):/.exec(message);
  // A generic parameter error (10001) is not enough: only the provider's
  // explicit unsupported/not-supported wording permits skipping an optional type.
  return Boolean(
    m &&
    !TRANSIENT_OR_AUTH_CODES.has(m[1]) &&
    /unsupported|not supported|not support|invalid query type/i.test(message),
  );
}

/**
 * Merge per-type results of one fetch. A rejected type never hides the rows of
 * the types that worked; it is reported (not silently dropped). Throws only
 * when every type failed.
 */

export function mergeCardTypeResults(
  results: PromiseSettledResult<any>[],
  types: readonly string[] = CARD_QUERY_TYPES,
  warn: (msg: string) => void = (m) => console.warn(m),
): any[] {
  const merged = new Map<string, { row: any; sourcePriority: number; updatedAt: number }>();
  let ok = 0;
  let lastError: unknown;
  results.forEach((res, typeIndex) => {
    if (res.status !== "fulfilled") {
      if (isUnsupportedCardTypeError(res.reason)) {
        warn(`bybit card type ${types[typeIndex] ?? typeIndex} unsupported: ${String((res.reason as Error)?.message ?? res.reason)}`);
        return;
      }
      lastError = res.reason;
      warn(
        `bybit card type ${types[typeIndex] ?? typeIndex} ${isUnsupportedCardTypeError(res.reason) ? "unsupported" : "failed"}: ${String((res.reason as Error)?.message ?? res.reason)}`,
      );
      return;
    }
    ok++;
    const rows = Array.isArray(res.value?.data) ? res.value.data : [];
    for (const r of rows) {
      const k = cardRowKey(r);
      const updatedAt = Number(r?.txnUpdate ?? r?.updateTime ?? r?.updatedTime ?? r?.settleTime ?? r?.txnCreate ?? 0);
      const current = merged.get(k);
      if (preferRecord(current, r, typeIndex, updatedAt)) merged.set(k, { row: r, sourcePriority: typeIndex, updatedAt });
    }
  });
  if (lastError) throw lastError;
  if (!ok) throw new Error("Bybit card history returned no successful query types");
  return [...merged.values()].map(({ row }) => row).filter((row) => !isLateSettlementRecord(row));
}

/**
 * Bybit's daily clearing re-sends every earlier purchase as a settlement
 * record (side 3) with new ids and a new time. It is the same purchase that
 * was already recorded at authorisation, so it is never ingested or shown.
 */

/**
 * Compatibility predicate retained for older callers. Bybit defines side 3
 * as a transaction/clearing record and side 13 as an ATM withdrawal. Neither
 * can be discarded as a presumed duplicate; canonical purchase identity is
 * responsible for collapsing genuine authorization/clearing copies.
 */
/**
 * Compatibility predicate: the provider's side values 3 (transaction) and
 * 13 (ATM withdrawal) are real movements, not safe-to-drop duplicates.
 */
export function isLateSettlementRecord(_row: any): boolean {
  return false;
}

/**
 * Storage key of ONE raw Bybit record (not of a purchase).
 * Raw authorisation and settlement records are kept side by side for auditing;
 * deciding that two records are the SAME purchase is the job of
 * `getCanonicalTransactionIdentity` in ./bybit-spend, which every total uses.
 */

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

/** Same record from two query types: keep the more final state, then the higher type, then the newer. */

export function preferRecord(
  current: { row: any; sourcePriority: number; updatedAt: number } | undefined,
  r: any,
  typeIndex: number,
  updatedAt: number,
) {
  if (!current) return true;
  const a = cardRecordRank(r);
  const b = cardRecordRank(current.row);
  if (a !== b) return a > b;
  return typeIndex > current.sourcePriority || (typeIndex === current.sourcePriority && updatedAt > current.updatedAt);
}

/** Fetch every card record ever recorded on the account, for every Bybit query type. */

export async function fetchCardPages(maxRows: number, creds: Creds, sinceMs?: number, budgetMs = 20_000): Promise<any[]> {
  const merged = new Map<string, { row: any; sourcePriority: number; updatedAt: number }>();
  const pageSize = 100;
  const maxPages = Math.max(1, Math.ceil(maxRows / pageSize));
  const deadline = Date.now() + budgetMs;
  let successfulTypes = 0;
  let lastError: unknown;
  const order = [...CARD_QUERY_TYPES.entries()].reverse();

  for (let orderIndex = 0; orderIndex < order.length; orderIndex++) {
    const [typeIndex, type] = order[orderIndex];
    if (Date.now() >= deadline) {
      throw new Error(`Bybit card history incomplete: time budget expired before query type ${type}`);
    }
    let typeComplete = false;
    let typeSucceeded = false;
    try {
      for (let page = 1; page <= maxPages; page++) {
        if (Date.now() >= deadline) {
          throw new Error(`Bybit card history incomplete: time budget expired during ${type} page ${page}`);
        }
        const result = await callCardPage({ limit: pageSize, page, type }, creds);
        typeSucceeded = true;
        const rows = Array.isArray(result?.data) ? result.data : [];
        for (const r of rows) {
          const k = cardRowKey(r);
          const updatedAt = Number(r?.txnUpdate ?? r?.updateTime ?? r?.updatedTime ?? r?.settleTime ?? r?.txnCreate ?? 0);
          const current = merged.get(k);
          if (preferRecord(current, r, typeIndex, updatedAt)) merged.set(k, { row: r, sourcePriority: typeIndex, updatedAt });
        }
        const totalCount = Number(result?.totalCount ?? 0);
        const pageNo = Number(result?.pageNo ?? page);
        const returnedPageSize = Number(result?.pageSize ?? pageSize);
        const hasMore = rows.length >= returnedPageSize && (totalCount <= 0 || pageNo * returnedPageSize < totalCount);
        const reachedCycleStart = sinceMs !== undefined && rows.some((row: any) => Number(row?.txnCreate ?? 0) < sinceMs);
        if (reachedCycleStart || !rows.length || !hasMore) {
          typeComplete = true;
          break;
        }
        if (page === maxPages) {
          throw new Error(`Bybit card history incomplete: ${type} exceeded the configured ${maxPages}-page limit`);
        }
        await sleep(250);
      }
      if (!typeComplete) throw new Error(`Bybit card history incomplete: ${type} pagination did not finish`);
      successfulTypes++;
    } catch (error) {
      lastError = error;
      if (isUnsupportedCardTypeError(error) && !typeSucceeded) {
        console.warn(`bybit card type ${type} unsupported:`, (error as Error)?.message ?? error);
        continue;
      }
      throw error;
    }
    await sleep(400);
  }

  if (!successfulTypes) {
    if (lastError) throw lastError;
    throw new Error("Bybit card history returned no supported query types");
  }
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
