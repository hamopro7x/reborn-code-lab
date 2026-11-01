/** Durable confirmation: provider observation time is captured BEFORE the request,
 * never when a cached response is written. Database enforces the same rule. */
export const BYBIT_CONFIRMATION_MS = 30_000;
export const BYBIT_REVERSAL_FOLLOWUP_MS = 60 * 60_000;

// First production build with durable gating. Compatibility is READ-ONLY:
// already saved rows remain visible, but may not be mirrored or newly assigned.
export const BYBIT_CONFIRMATION_ROLLOUT = "2026-11-01T02:24:55Z";
export const LEGACY_CARD_READ_FILTER =
  `and(created_at.lt.${BYBIT_CONFIRMATION_ROLLOUT},detail->>confirmationState.is.null)`;
export const CARD_READ_FILTER = `detail->>confirmationState.eq.confirmed,${LEGACY_CARD_READ_FILTER}`;

export function legacyCardReadable(row: { created_at?: unknown; confirmed_at?: unknown; detail?: any }): boolean {
  const first = Date.parse(String(row.created_at ?? ""));
  return Number.isFinite(first) && first < Date.parse(BYBIT_CONFIRMATION_ROLLOUT) &&
    row.confirmed_at == null && row.detail?.confirmationState == null;
}

export function archivedCardReadable(row: { created_at?: unknown; confirmed_at?: unknown; detail?: any }, now = Date.now()): boolean {
  return cardConfirmed(row, now) || legacyCardReadable(row);
}

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