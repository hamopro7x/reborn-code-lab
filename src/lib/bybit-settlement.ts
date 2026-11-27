/**
 * Side 3 is Bybit's clearing/transaction copy of an earlier authorization.
 * Keep it in the raw archive and central ledger; only suppress its duplicate
 * shift assignment. Side 13 is an actual ATM withdrawal and must be retained.
 */
export const SETTLEMENT_COPY_SIDES = new Set(["3"]);
/** Retained for compatibility; central ledger repair must include all sides. */
export const SETTLEMENT_COPY_FILTER = "";
