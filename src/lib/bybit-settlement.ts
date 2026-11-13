/**
 * Bybit clearing copies of an earlier record, never a new charge:
 * side 3 = purchase settlement; side 13 = next-day ATM clearing of a side-21
 * ATM withdrawal (new ids, cryptoSold false, absent from Bybit's own history).
 */
export const SETTLEMENT_COPY_SIDES = new Set(["3", "13"]);
export const SETTLEMENT_COPY_FILTER = "detail->>side.is.null,detail->>side.not.in.(3,13)";
