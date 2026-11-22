import { describe, expect, it } from "vitest";
import { isLedgerRowChanged } from "./bybit-ledger-compare";

describe("Bybit ledger change detection", () => {
  const base = {
    direction: "out",
    title: "Merchant",
    amount: -10,
    currency: "USD",
    fee: 0.2,
    status: "success",
    occurred_at: "2026-11-22T10:00:00.000Z",
    detail: { tradeStatus: "2", side: "1", linkedReversal: false },
  };

  it("treats a missing prior row as changed", () => {
    expect(isLedgerRowChanged(undefined, base)).toBe(true);
  });

  it("ignores identical persisted values", () => {
    expect(isLedgerRowChanged({ ...base, tradeStatus: "2", side: "1", linkedReversal: "false" }, base)).toBe(false);
  });

  it("detects business-field changes", () => {
    expect(isLedgerRowChanged(base, { ...base, amount: -11 })).toBe(true);
    expect(isLedgerRowChanged(base, { ...base, status: "reversed" })).toBe(true);
  });

  it("detects provider reconciliation metadata changes", () => {
    expect(isLedgerRowChanged(base, { ...base, detail: { ...base.detail, tradeStatus: "1" } })).toBe(true);
    expect(isLedgerRowChanged(base, { ...base, detail: { ...base.detail, side: "2" } })).toBe(true);
    expect(isLedgerRowChanged(base, { ...base, detail: { ...base.detail, linkedReversal: true } })).toBe(true);
  });
});
