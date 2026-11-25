import { describe, it, expect } from "vitest";
import { SETTLEMENT_COPY_SIDES } from "./bybit-settlement";
import { isCardSettlement } from "./work-assign.server";

describe("Bybit movement types", () => {
  it("retains documented side 3 transactions and side 13 ATM withdrawals", () => {
    expect(SETTLEMENT_COPY_SIDES.has("3")).toBe(false);
    expect(SETTLEMENT_COPY_SIDES.has("13")).toBe(false);
    expect(isCardSettlement({ kind: "card", detail: { side: "3" } })).toBe(false);
    expect(isCardSettlement({ kind: "card", detail: { side: "13" } })).toBe(false);
  });
  it("does not treat authorization or direct transaction as discardable", () => {
    expect(isCardSettlement({ kind: "card", detail: { side: "1" } })).toBe(false);
    expect(isCardSettlement({ kind: "card", detail: { side: "7" } })).toBe(false);
  });
});
