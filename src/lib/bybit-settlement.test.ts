import { describe, it, expect } from "vitest";
import { SETTLEMENT_COPY_SIDES } from "./bybit-settlement";
import { isCardSettlement } from "./work-assign.server";

describe("Bybit clearing copies", () => {
  it("next-day ATM clearing (side 13) is not a new charge", () => {
    expect(SETTLEMENT_COPY_SIDES.has("13")).toBe(true);
    expect(isCardSettlement({ kind: "card", detail: { side: "13" } })).toBe(true);
  });
  it("the original ATM withdrawal (side 21) still counts", () => {
    expect(SETTLEMENT_COPY_SIDES.has("21")).toBe(false);
    expect(isCardSettlement({ kind: "card", detail: { side: "21" } })).toBe(false);
  });
});
