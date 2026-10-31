import { describe, it, expect } from "vitest";
import { isCardSettlement } from "./work-assign.server";

describe("shift auto-assign", () => {
  it("skips Bybit late settlements of earlier purchases", () => {
    expect(isCardSettlement({ kind: "card", detail: { side: 3 } })).toBe(true);
  });
  it("keeps new purchases and direct transactions", () => {
    expect(isCardSettlement({ kind: "card", detail: { side: 1 } })).toBe(false);
    expect(isCardSettlement({ kind: "card", detail: { side: 7 } })).toBe(false);
  });
});
