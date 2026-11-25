import { describe, it, expect } from "vitest";
import { isCardSettlement } from "./work-assign.server";

describe("shift auto-assign", () => {
  it("skips a side-3 clearing copy to avoid a duplicate shift charge", () => {
    expect(isCardSettlement({ kind: "card", detail: { side: 3 } })).toBe(true);
  });
  it("keeps actual ATM withdrawals and direct transactions eligible", () => {
    expect(isCardSettlement({ kind: "card", detail: { side: 13 } })).toBe(false);
    expect(isCardSettlement({ kind: "card", detail: { side: 7 } })).toBe(false);
  });
});
