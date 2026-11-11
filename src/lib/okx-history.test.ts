import { describe, expect, it } from "vitest";
import { mapOkxHistory, okxHistoryCursor } from "./okx-history";

describe("read-only OKX details", () => {
  it("keeps signed balance changes and decimal precision, without inventing funding fees", () => {
    expect(mapOkxHistory({ billId: "12", ts: "1793500000000", ccy: "USDT", balChg: "-0.000000000000001", type: "2" }, "funding"))
      .toMatchObject({ id: "12", amount: "-0.000000000000001", fee: null, currency: "USDT" });
  });
  it("uses filled quantity, not requested quantity or a guessed USD amount, for orders", () => {
    expect(mapOkxHistory({ ordId: "55", cTime: "1793500000000", sz: "100", accFillSz: "0.01", side: "buy", instId: "BTC-USDT", fee: "-0.00001", feeCcy: "BTC", state: "canceled" }, "orders"))
      .toMatchObject({ id: "55", amount: "0.01", fee: "-0.00001", feeCurrency: "BTC", status: "ملغاة", instrument: "BTC-USDT" });
  });
  it("preserves negative trading fees and their currency", () => {
    expect(mapOkxHistory({ billId: "9", balChg: "1", fee: "-0.03", ccy: "ETH" }, "bills"))
      .toMatchObject({ amount: "1", fee: "-0.03", feeCurrency: "ETH" });
  });
  it("paginates funding by timestamp, account bills by billId and orders by ordId", () => {
    const rows = Array.from({ length: 100 }, () => ({ ts: "1793500000000", billId: "123", ordId: "456" }));
    expect(okxHistoryCursor(rows, "funding")).toBe("1793500000000");
    expect(okxHistoryCursor(rows, "bills")).toBe("123");
    expect(okxHistoryCursor(rows, "orders")).toBe("456");
  });
  it("stops on a short or empty provider page", () => {
    expect(okxHistoryCursor([], "funding")).toBeNull();
    expect(okxHistoryCursor([{ billId: "123" }], "bills")).toBeNull();
  });
});