import { SETTLEMENT_COPY_SIDES } from "./bybit-settlement";
import { cardRowKey } from "./bybit-card-mapper";
import { isExplicitReversal } from "./bybit-spend";

export const CARD_QUERY_TYPES = [
  "SIDE_QUERY_AUTH",
  "SIDE_QUERY_AUTH_ALL",
  "SIDE_QUERY_FINANCIAL_ALL",
  "SIDE_QUERY_FINANCIAL_REFUND",
  "SIDE_QUERY_AUTH_REVERSAL",
];

/** How final a raw record's state is: a later sync never downgrades a reversal. */
export function cardRecordRank(t: any): number {
  if (isExplicitReversal(t?.tradeStatus ?? t?.status, t?.side)) return 3;
  const ts = String(t?.tradeStatus ?? t?.status ?? "");
  if (ts === "2") return 2;
  if (ts === "1") return 1;
  return 0;
}

/** True when Bybit rejected the request itself, not a network/auth/rate-limit error. */
const TRANSIENT_OR_AUTH_CODES = new Set(["10002", "10003", "10004", "10005", "10006", "10016", "10018"]);
export function isUnsupportedCardTypeError(err: unknown): boolean {
  const m = /^Bybit (\\d+):/.exec(String((err as Error)?.message ?? err ?? ""));
  return Boolean(m && !TRANSIENT_OR_AUTH_CODES.has(m[1]));
}

/** Bybit re-sends purchases as side-3 clearing records; these are not new purchases. */
export function isLateSettlementRecord(row: any): boolean {
  return SETTLEMENT_COPY_SIDES.has(String(row?.side ?? ""));
}

/** Prefer final state, then source query priority, then the newest provider update. */
export function preferRecord(
  current: { row: any; sourcePriority: number; updatedAt: number } | undefined,
  row: any,
  typeIndex: number,
  updatedAt: number,
): boolean {
  if (!current) return true;
  const a = cardRecordRank(row);
  const b = cardRecordRank(current.row);
  if (a !== b) return a > b;
  return typeIndex > current.sourcePriority || (typeIndex === current.sourcePriority && updatedAt > current.updatedAt);
}

/** Merge successful query types without losing rows from a partially rejected query. */
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
      lastError = res.reason;
      warn(
        `bybit card type ${types[typeIndex] ?? typeIndex} ${isUnsupportedCardTypeError(res.reason) ? "unsupported" : "failed"}: ${String((res.reason as Error)?.message ?? res.reason)}`,
      );
      return;
    }
    ok++;
    const rows = Array.isArray(res.value?.data) ? res.value.data : [];
    for (const item of rows) {
      const key = cardRowKey(item);
      const updatedAt = Number(item?.txnUpdate ?? item?.updateTime ?? item?.updatedTime ?? item?.settleTime ?? item?.txnCreate ?? 0);
      const current = merged.get(key);
      if (preferRecord(current, item, typeIndex, updatedAt)) {
        merged.set(key, { row: item, sourcePriority: typeIndex, updatedAt });
      }
    }
  });
  if (!ok && lastError) throw lastError;
  return [...merged.values()].map(({ row }) => row).filter((row) => !isLateSettlementRecord(row));
}
