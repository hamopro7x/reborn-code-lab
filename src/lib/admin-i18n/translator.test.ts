import { describe, it, expect } from "vitest";
import { translateText } from "./translator";
describe("admin translator", () => {
  it("translates exact strings", () => expect(translateText("طرق الدفع")).toBe("Payment Methods"));
  it("leaves non-Arabic untouched", () => expect(translateText("USDT 50")).toBe("USDT 50"));
});
