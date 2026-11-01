import { describe, expect, it } from "vitest";
import { findLinkedReversals, sumSpend, type SpendRow } from "./bybit-spend";

const time = Date.UTC(2026, 9, 31, 21, 33, 47);
const groups = [
  { amount: 2.79, ids: ["3000000683626441", "3000000683626471", "3000000683640474"] },
  { amount: 3.61, ids: ["3000000683749966", "3000000683750004", "3000000683764413"] },
  { amount: 3.08, ids: ["3000000683935780", "3000000683935812", "3000000683972959"] },
];

describe("Bybit ambiguous reversals are held, never guessed", () => {
  for (const { amount, ids } of groups) {
    it(`holds the ${amount} pair outside finalized spend until review`, () => {
      const rows: SpendRow[] = ids.map((txnId, i) => ({
        txnId, amount, pan4: "0540", time: time + [0, 3000, 21 * 60_000][i],
        status: i === 2 ? "failed" : "success", type: i === 2 ? "2" : "1",
        detail: { side: i === 2 ? "2" : "1", tradeStatus: i === 1 ? "0" : "1", orderNo: `order-${txnId}`, basicAmount: amount, basicCurrency: "USD" },
      }));
      expect(sumSpend(rows, 0, 0).monthSpend).toBe(0);
    });
  }

  it("does not link the two simultaneous accounts' ambiguous groups", () => {
    const rows = ["account-a", "account-b"].flatMap((scope) => groups.flatMap(({ amount, ids }) =>
      ids.map((id, i) => ({
        id: `${scope}-${id}`, scope, txnId: id, orderNo: `order-${id}`,
        side: i === 2 ? "2" : "1", tradeStatus: i === 1 ? "0" : "1",
        pan4: "0540", amount, time: time + [0, 3000, 21 * 60_000][i],
      })),
    ));
    expect([...findLinkedReversals(rows)]).toEqual([]);
  });
});