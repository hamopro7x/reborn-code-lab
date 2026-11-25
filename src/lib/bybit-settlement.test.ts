import { describe, it, expect } from "vitest";
import { SETTLEMENT_COPY_SIDES } from "./bybit-settlement";
import { isCardSettlement } from "./work-assign.server";

describe("Bybit movement types", () => {
  it("retains side 3 in the ledger but avoids a duplicate shift assignment", () => {
    expect(SETTLEMENT_COPY_SIDES.has("3")).toBe(true);
    expect(SETTLEMENT_COPY_SIDES.has("13")).toBe(false);
    expect(isCardSettlement({ kind: "card", detail: { side: "3" } })).toBe(true);
  });
  it("does not suppress real ATM withdrawals, authorizations or direct transactions", () => {
    expect(isCardSettlement({ kind: "card", detail: { side: "13" } })).toBe(false);
    expect(isCardSettlement({ kind: "card", detail: { side: "1" } })).toBe(false);
    expect(isCardSettlement({ kind: "card", detail: { side: "7" } })).toBe(false);
  });
});
