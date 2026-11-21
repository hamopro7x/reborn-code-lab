/**
 * Pure mapping between Bybit provider card records and the stable MG Pro card transaction model.
 * No database writes or network requests belong in this module.
 */
import {
  getCanonicalTransactionIdentity,
  cardRecordOutcome,
  cryptoSoldOf,
  legacyReversalUnproven,
  durableCardReversal,
} from "./bybit-spend";
import { num } from "./bybit-runtime";

export function cardRowKey(t: any) {
  return String(
    t?.txnId
      ?? t?.orderNo
      ?? [t?.txnCreate, t?.merchName, t?.pan4, t?.side, t?.basicAmount ?? t?.transactionAmount].join("-"),
  );
}

/** Canonical purchase identity of a raw provider row (shared engine, stored for audit). */
function canonicalIdOfRaw(t: any) {
  return getCanonicalTransactionIdentity({
    txnId: String(t?.txnId ?? t?.transactionId ?? t?.id ?? ""),
    amount: num(t?.basicAmount ?? t?.transactionAmount),
    time: Number(t?.txnCreate ?? 0),
    detail: {
      paymentId: t?.paymentId,
      orderNo: t?.orderNo,
      orderId: t?.orderId,
      referenceId: t?.referenceId,
      refId: t?.refId,
      merchName: t?.merchName,
    },
  });
}


/** Bybit Card expects POST filters and pagination in the signed JSON body. */

export type CardTxn = {
  id: string;
  merchant: string;
  amount: number;
  currency: string;
  status: "success" | "failed" | "refund" | "pending" | "review";
  time: number;
  pan4: string;
  type: string;
  detail: Record<string, string | number | null>;
  /** Bybit «معكوسة» (voided authorisation / hung retry): shown as failed, hidden from employees. */
  reversed?: boolean;
};

export function sanitize(o: Record<string, unknown>): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined) out[k] = null;
    else if (typeof v === "number" || typeof v === "string") out[k] = v;
    else out[k] = String(v);
  }
  return out;
}

/** First non-empty value among the given raw keys, otherwise null. */
function pick(t: any, keys: string[]): string | number | null {
  for (const k of keys) {
    const v = t?.[k];
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "number" || typeof v === "string") return v;
    return JSON.stringify(v);
  }
  return null;
}

/**
 * Full transaction stage, derived ONLY from values the provider returned.
 * Never inferred when the provider gives nothing.
 */
function stageOf(t: any): string | null {
  const explicit = pick(t, ["eventCode", "transactionEventCode", "txnEventCode", "transactionType", "txnType"]);
  if (explicit !== null) return String(explicit);
  if (String(t?.side ?? "") === "2") return "AUTH_REVERSAL";
  const ts = String(t?.tradeStatus ?? t?.status ?? "");
  // Official tradeStatus: 0 In_Progress, 1 Completed, 2 Declined, 3 Reversal.
  // "4"/"5" only appear in rows archived by older code.
  const map: Record<string, string> = {
    "0": "PENDING",
    "1": "COMPLETED",
    "2": "DECLINED",
    "3": "REVERSED",
    "4": "REVERSED",
    "5": "REFUNDED",
  };
  return map[ts] ?? null;
}

export function mapCardTxn(t: any): CardTxn {
    const side = String(t.side ?? "");
    // Shared rule (bybit-spend.cardRecordOutcome). A reversed («معكوسة»)
    // authorisation was never charged, so it is stored as "failed" and never
    // counts as a purchase — it used to fall through to "success".
    const outcome = cardRecordOutcome(t.tradeStatus ?? t.status, side, cryptoSoldOf(t));
    const status: CardTxn["status"] =
      outcome === "refund" ? "refund" : outcome === "ok" ? "success" : "failed";


    return {
      id: cardRowKey(t),
      merchant: String(t.merchName ?? "—"),
      amount: num(t.basicAmount ?? t.transactionAmount),
      currency: String(t.basicCurrency ?? t.transactionCurrency ?? "USD"),
      status,
      reversed: outcome === "reversed" || undefined,
      time: Number(t.txnCreate ?? 0),
      pan4: String(t.pan4 ?? ""),
      type: side,
      detail: sanitize({
        // ---- core identifiers ----
        observedAt: t.__observedAt ?? null,
        txnId: pick(t, ["txnId", "transactionId", "id"]),
        // Purchase identity shared by the authorisation and settlement copies;
        // stored so audits can see exactly how a purchase was collapsed.
        canonicalId: canonicalIdOfRaw(t),

        orderId: pick(t, ["orderNo", "orderId", "referenceId", "refId"]),
        orderNo: t.orderNo ?? null,
        paymentId: pick(t, ["paymentId"]),
        authCode: pick(t, ["authCode", "authorizationCode"]),
        // ---- status ----
        stage: stageOf(t),
        eventCode: pick(t, ["eventCode", "transactionEventCode", "txnEventCode"]),
        tradeStatus: t.tradeStatus ?? t.status ?? null,
        cryptoSold: t.cryptoSold ?? null,
        side: t.side ?? null,
        createdAt: pick(t, ["txnCreate", "createTime", "createdTime"]),
        updatedAt: pick(t, ["txnUpdate", "updateTime", "updatedTime", "settleTime"]),
        // ---- amounts & fees ----
        transactionAmount: t.transactionAmount ?? null,
        transactionCurrency: t.transactionCurrency ?? null,
        basicAmount: t.basicAmount ?? null,
        basicCurrency: t.basicCurrency ?? null,
        localAmount: t.localAmount ?? t.originalAmount ?? null,
        localCurrency: t.localCurrency ?? t.originalCurrency ?? null,
        grossAmount: pick(t, ["grossAmount", "totalAmount"]),
        netAmount: pick(t, ["netAmount", "settleAmount"]),
        // Bybit's own USD valuation of a foreign-currency purchase, kept verbatim
        // so spend never needs an exchange rate of our own.
        settleAmount: pick(t, ["settleAmount", "settlementAmount"]),
        settleCurrency: pick(t, ["settleCurrency", "settlementCurrency"]),
        usdAmount: pick(t, ["usdAmount", "amountUsd", "usdValue", "convertUsdAmount"]),
        // Fees exactly as the source account returns them (no math, no fallbacks).
        totalFees: pick(t, ["totalFees"]),
        foreignTransactionFee: pick(t, ["foreignTransactionFee", "foreignTxnFee"]),
        interchangeFee: pick(t, ["interchangeFee"]),
        withdrawalFee: pick(t, ["withdrawalFee"]),
        fxPad: pick(t, ["fxPad"]),
        feeAmount: pick(t, ["totalFees", "feeAmount", "fee", "handlingFee"]),
        feeCurrency: pick(t, ["feeCurrency", "foreignTxnFeeCurrency"]),
        tax: pick(t, ["tax", "taxAmount"]),
        shipping: pick(t, ["shipping", "shippingAmount"]),
        paidWithCrypto: t.cryptoAmount ?? null,
        paidWithFiat: t.fiatAmount ?? null,
        protectionEligibility: pick(t, ["protectionEligibility", "protectionEligibilityType"]),
        // ---- processor / decline data ----
        responseCode: pick(t, ["responseCode", "processorResponseCode", "respCode"]),
        avsCode: pick(t, ["avsCode", "avsResponseCode", "avsResult"]),
        cvvCode: pick(t, ["cvvCode", "cvv2Code", "cvvResult"]),
        paymentAdviceCode: pick(t, ["paymentAdviceCode", "adviceCode"]),
        declineCode: pick(t, ["declineCode", "failCode", "rejectCode", "errorCode"]),
        declineReason: pick(t, [
          "declineReason",
          "failReason",
          "rejectReason",
          "reason",
          "statusReason",
          "errorMsg",
          "errorMessage",
          "retMsg",
          "msg",
        ]),
        apiErrorCode: pick(t, ["retCode", "httpCode", "statusCode"]),
        // ---- merchant ----
        merchantName: t.merchName ?? null,
        merchantWebsite: pick(t, ["merchWebsite", "merchUrl", "merchantUrl", "website"]),
        merchantEmail: pick(t, ["merchEmail", "merchantEmail", "supportEmail"]),
        merchantDescription: pick(t, ["merchDesc", "merchantDescription", "description", "remark"]),
        mcc: t.mcc ?? t.merchCategory ?? null,
        merchantLocation: [t.merchCity, t.merchCountry].filter(Boolean).join(", ") || null,
        terminalId: pick(t, ["terminalId", "terminalNo"]),
        storeId: pick(t, ["storeId", "storeNo", "merchId", "merchantId"]),
        // ---- raw provider payload, stored verbatim ----
        raw: JSON.stringify(t),
      }),
    };
}

export function mapStoredRow(r: any): CardTxn {
  const detail = (r.detail ?? {}) as Record<string, string | number | null>;
  const side = String(detail.side ?? r.txn_type ?? "");
  const linked = durableCardReversal(detail);
  const outcome = linked ? "reversed" : cardRecordOutcome(detail.tradeStatus, side, cryptoSoldOf(detail));
  // Bybit's own raw status wins whenever it says refund / reversed / failed:
  // older rows were stored as "success" while Bybit had reversed them.
  const stored: CardTxn["status"] | null =
    r.status === "success" || r.status === "failed" || r.status === "refund" ? r.status : null;
  const status: CardTxn["status"] =
    outcome === "refund"
      ? "refund"
      : outcome === "reversed" || outcome === "failed"
        ? "failed"
        : legacyReversalUnproven(detail) || detail.reconciliationState === "needs_review" ? "review" : (stored ?? "success");




  return {
    id: r.txn_id,
    merchant: r.merchant ?? "—",
    amount: num(r.amount),
    currency: r.currency ?? "USD",
    status,
    time: Number(r.txn_time ?? 0),
    pan4: r.pan4 ?? "",
    type: r.txn_type ?? "",
    detail,
    reversed: outcome === "reversed" || (!legacyReversalUnproven(detail) && r.status === "reversed"),
  };
}
