import { describe, expect, it } from "vitest";
import { canonicalize, cardRecordOutcome, findLinkedReversals, isExplicitReversal, sumSpend, sumSpendByCard, type SpendRow } from "./bybit-spend";

const MONTH = Date.UTC(2026, 9, 1);
const DAY = Date.UTC(2026, 9, 29);
const T = DAY + 60_000;

const r = (txnId: string, d: Record<string, unknown>, amount = 10, time = T): SpendRow => ({
  txnId, amount, time, status: "success", type: String(d.side ?? "1"), currency: "USD", pan4: "1111",
  detail: { basicAmount: amount, basicCurrency: "USD", merchantName: "SHOP", ...d },
});
const spend = (rows: SpendRow[]) => sumSpend(rows, DAY, MONTH).monthSpend;

describe("Bybit official status mapping", () => {
  it("tradeStatus 3 is a reversal (failed), not a refund", () => {
    expect(cardRecordOutcome("3", "1")).toBe("reversed");
  });
  it("side 2 (Authorization Reversal) is reversed", () => {
    expect(cardRecordOutcome("1", "2")).toBe("reversed");
  });
  it("sides 3 and 7 are purchases", () => {
    expect(cardRecordOutcome("1", "3")).toBe("ok");
    expect(cardRecordOutcome("1", "7")).toBe("ok");
  });
  it("in-progress and completed are successful", () => {
    expect(cardRecordOutcome("0", "1")).toBe("ok");
    expect(cardRecordOutcome("1", "1", true)).toBe("ok");
  });
  it("declined is failed", () => {
    expect(cardRecordOutcome("2", "1")).toBe("failed");
  });
  it("standalone refund side 5 is a refund", () => {
    expect(cardRecordOutcome("1", "5")).toBe("refund");
    expect(isExplicitReversal("1", "5")).toBe(false);
  });
});

describe("reversal regression", () => {
  it("pending -> reversed with the same txnId leaves spend", () => {
    expect(spend([r("A", { tradeStatus: "0", side: "1", txnId: "A" }, 7)])).toBe(7);
    expect(spend([r("A", { tradeStatus: "3", side: "1", txnId: "A" }, 7)])).toBe(0);
  });

  it("separate reversal record linked by orderNo voids the authorisation", () => {
    const rows = [
      r("AUTH", { tradeStatus: "0", side: "1", txnId: "AUTH", orderNo: "O1" }, 5),
      r("REV", { tradeStatus: "1", side: "2", txnId: "REV", orderNo: "O1" }, 5),
    ];
    expect(spend(rows)).toBe(0);
    expect([...findLinkedReversals(rows.map((x) => ({ id: x.txnId, scope: "acc", orderNo: x.detail!.orderNo, txnId: x.txnId, tradeStatus: x.detail!.tradeStatus, side: x.detail!.side })))]).toEqual(["AUTH"]);
  });

  it("links never cross accounts", () => {
    const set = findLinkedReversals([
      { id: "a", scope: "acc1", orderNo: "O9", txnId: "a", tradeStatus: "0", side: "1" },
      { id: "b", scope: "acc2", orderNo: "O9", txnId: "b", tradeStatus: "1", side: "2" },
    ]);
    expect(set.size).toBe(0);
  });

  it("a different orderNo with same amount and time is NOT voided", () => {
    expect(spend([
      r("X1", { tradeStatus: "0", side: "1", orderNo: "O2" }, 5),
      r("X2", { tradeStatus: "1", side: "2", orderNo: "O3" }, 5),
    ])).toBe(5);
  });

  it("declined never counts", () => {
    expect(spend([r("D", { tradeStatus: "2", side: "1", orderNo: "OD" }, 50)])).toBe(0);
  });

  it("legitimate completed purchase counts once (auth + clearing)", () => {
    expect(spend([
      r("AU", { tradeStatus: "1", side: "1", orderNo: "OK1", cryptoSold: true }, 20),
      r("CL", { tradeStatus: "1", side: "3", orderNo: "OK1" }, 20),
    ])).toBe(20);
  });

  it("a standalone refund does not void the purchase nor count as spend", () => {
    expect(spend([
      r("P", { tradeStatus: "1", side: "1", orderNo: "OR", cryptoSold: true }, 30),
      r("RF", { tradeStatus: "1", side: "5", orderNo: "OR2" }, 30),
    ])).toBe(30);
  });

  it("status transition after a later sync: pending first, reversal later", () => {
    const first = [r("A2", { tradeStatus: "0", side: "1", orderNo: "OT" }, 9)];
    expect(spend(first)).toBe(9);
    const later = [...first, r("R2", { tradeStatus: "1", side: "2", orderNo: "OT" }, 9)];
    expect(spend(later)).toBe(0);
    expect(canonicalize(later).transactions.size).toBe(0);
  });

  it("per-card spend agrees with account spend", () => {
    const rows = [
      r("A3", { tradeStatus: "0", side: "1", orderNo: "OC" }, 4),
      r("R3", { tradeStatus: "1", side: "2", orderNo: "OC" }, 4),
      r("G", { tradeStatus: "1", side: "1", orderNo: "OG", cryptoSold: true }, 6),
    ];
    const byCard = sumSpendByCard(rows, () => "1111");
    expect(byCard.get("1111")!.spend).toBe(6);
    expect(spend(rows)).toBe(6);
  });
});
