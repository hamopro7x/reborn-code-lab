import { describe, expect, it } from "vitest";
import { auditSpend, cardPurchaseGroup, canonicalize, sumSpend, type SpendRow } from "./bybit-spend";

const T = Date.UTC(2026, 10, 1, 6, 8, 47);
const purchase = (scope: string, txnId: string, detail: Record<string, unknown> = {}, time = T): SpendRow => ({
  scope, txnId, amount: 20.55, time, currency: "USD", pan4: "6938", merchant: "SHOP", status: "success", type: "1",
  detail: { side: "1", tradeStatus: "1", basicAmount: 20.55, basicCurrency: "USD", ...detail },
});

describe("strict financial evidence regressions", () => {
  it("unsourced legacy reversal is review, not proven failure", () => {
    expect(cardPurchaseGroup({ status: "success", detail: { side: "1", tradeStatus: "1", linkedReversal: 1 } })).toBe("review");
  });
  it("explicit provider reversal wins over stale review metadata", () => {
    expect(cardPurchaseGroup({ status: "review", detail: { side: "1", tradeStatus: "3", reconciliationState: "needs_review" } })).toBe("failed");
  });
  it("a resolved retry is not failed by a preserved legacy flag", () => {
    expect(cardPurchaseGroup({ status: "success", detail: { side: "1", tradeStatus: "1", linkedReversal: 1, reconciliationState: "clear", projectedStatus: "success" } })).toBe("success");
  });
  it("21 minute ambiguous side2 holds only its account, even with identical record IDs", () => {
    const rows = [purchase("A", "first"), purchase("A", "retry", { tradeStatus: "0" }, T + 2000),
      { ...purchase("A", "event", { side: "2" }, T + 21 * 60000), type: "2" }, purchase("B", "first"), purchase("B", "retry")];
    expect(sumSpend(rows, 0, 0).monthSpend).toBeCloseTo(41.1);
    expect(rows[0].status).toBe("success");
  });
  it("replay pending then explicit reversal excludes the stale copy regardless of order", () => {
    const pending = purchase("A", "same", { tradeStatus: "0" });
    const reversed = purchase("A", "same", { tradeStatus: "3" });
    for (const rows of [[pending, reversed], [reversed, pending]]) expect(sumSpend(rows, 0, 0).monthSpend).toBe(0);
  });
  it("durable manual decision leaves its confirmed retry in spend", () => {
    const a = purchase("A", "3000000683749966", { linkedBy: "manual-user-20261101", linkedReversal: 1 });
    const b = purchase("A", "3000000683750004");
    expect(sumSpend([a, b], 0, 0).monthSpend).toBe(20.55);
  });
  it("account-scoped audit agrees with totals and identifies the winning row", () => {
    const audit = auditSpend([purchase("A", "a")]);
    expect(audit.entries[0].counted).toBe(true);
    expect(audit.entries[0].isWinner).toBe(true);
    expect(audit.totals.monthSpend).toBe(20.55);
  });
  it("settlement cannot consume another account's authorization", () => {
    const a = purchase("A", "a");
    const s = { ...purchase("B", "s", { side: "3" }, T + 60000), type: "3" };
    expect(canonicalize([a, s]).transactions.size).toBe(2);
  });
  it("EUR fee is never deducted from USD spend", () => {
    const a = purchase("A", "a", { totalFees: 1.83, feeCurrency: "EUR" });
    const audit = auditSpend([a]);
    expect(audit.totals.monthSpend).toBe(20.55);
    expect(audit.entries[0].fee).toBe(0);
  });
});