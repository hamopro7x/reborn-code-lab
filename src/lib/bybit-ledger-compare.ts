import { sameStoredValue, detailText } from "./bybit-value-helpers";

/** Ledger fields that determine whether a persisted row actually changed. */
const LEDGER_COMPARE = [
  "direction",
  "title",
  "amount",
  "currency",
  "fee",
  "status",
  "occurred_at",
] as const;

/** Compare persisted ledger fields and the provider metadata used for reconciliation. */
export function isLedgerRowChanged(prev: Record<string, any> | undefined, row: Record<string, any>): boolean {
  if (!prev) return true;
  return (
    LEDGER_COMPARE.some((key) => !sameStoredValue(prev[key], row[key])) ||
    (["tradeStatus", "side", "linkedReversal"] as const).some(
      (key) => !sameStoredValue(prev[key], detailText(((row.detail ?? {}) as Record<string, unknown>)[key])),
    )
  );
}
