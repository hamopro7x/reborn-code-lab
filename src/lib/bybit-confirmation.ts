/** Durable confirmation: provider observation time is captured BEFORE the request,
 * never when a cached response is written. Database enforces the same rule. */
export const BYBIT_CONFIRMATION_MS = 30_000;
export const BYBIT_REVERSAL_FOLLOWUP_MS = 60 * 60_000;

export function cardConfirmed(row: { created_at?: unknown; confirmed_at?: unknown }, now = Date.now()): boolean {
  const first = Date.parse(String(row.created_at ?? ""));
  const confirmed = Date.parse(String(row.confirmed_at ?? ""));
  return Number.isFinite(first) && Number.isFinite(confirmed) &&
    confirmed >= first + BYBIT_CONFIRMATION_MS && confirmed <= now;
}

/** Persisted projections always carry this marker; absent markers fail closed. */
export function cardProjectionVisible(detail: any): boolean {
  return detail?.confirmationState === "confirmed";
}