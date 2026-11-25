import { describe, it, expect } from "vitest";
import { isCardSettlement } from "./work-assign.server";

describe("shift auto-assign", () => {
  it("keeps completed transactions and ATM withdrawals eligible for their shift", () => {
    expect(isCardSettlement({ kind: "card", detail: { side: 3 } })).toBe(false);
    expect(isCardSettlement({ kind: "card", detail: { side: 13 } })).toBe(false);
  });
  it("keeps authorizations and direct transactions eligible too", () => {
    expect(isCardSettlement({ kind: "card", detail: { side: 1 } })).toBe(false);
    expect(isCardSettlement({ kind: "card", detail: { side: 7 } })).toBe(false);
  });
});
