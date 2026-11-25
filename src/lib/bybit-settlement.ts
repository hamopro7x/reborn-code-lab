/**
 * Legacy settlement-copy exclusions were unsafe: Bybit's official API defines
 * side 3 as a transaction/clearing record and side 13 as an ATM withdrawal.
 * Keep this module as an empty compatibility export while readers migrate to
 * canonical purchase identity for deduplication.
 */
export const SETTLEMENT_COPY_SIDES = new Set<string>();
export const SETTLEMENT_COPY_FILTER = "";
