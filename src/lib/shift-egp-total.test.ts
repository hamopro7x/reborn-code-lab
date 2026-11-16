import { describe, expect, it } from "vitest";
import { shiftEgpTotal } from "./shift-egp-total";

describe("employee sheet EGP total", () => {
  it("adds only EGP cells from both manual and API transactions", () => {
    const rows = [
      { egp: 150, amount: 19.07, quantity: 4, __manual: false },
      { egp: "1,250.50", amount: 50, quantity: 10, __manual: true },
    ];
    expect(shiftEgpTotal(rows)).toBe(1400.5);
  });

  it("matches admin absolute-value totals and ignores empty or invalid cells", () => {
    expect(shiftEgpTotal([{ egp: -20 }, { egp: 5.25 }, { egp: null }, {}, { egp: "--" }, { egp: Infinity }])).toBe(25.25);
    expect(shiftEgpTotal([])).toBe(0);
  });
});