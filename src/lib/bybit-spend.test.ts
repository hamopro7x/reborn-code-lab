import { describe, expect, it } from "vitest";
import { sumSpend, sumSpendByCard, type SpendRow } from "./bybit-spend";

const MONTH_START = Date.UTC(2026, 7, 1);
const DAY_START = Date.UTC(2026, 7, 17);

function row(over: Partial<SpendRow> & { detail?: Record<string, unknown> }): SpendRow {
  return {
    txnId: "t1",
    amount: 10,
    time: Date.UTC(2026, 7, 5),
    status: "success",
    type: "1",
    currency: "USD",
    detail: { tradeStatus: "1", side: "1", basicAmount: 10, basicCurrency: "USD" },
    ...over,
  };
}

describe("monthly spend engine", () => {
  it("counts a purchase archived as both authorisation and settlement only once", () => {
    const totals = sumSpend(
      [
        row({ txnId: "auth-1", amount: 4, detail: { tradeStatus: "0", side: "1", paymentId: "P1", basicAmount: 4, basicCurrency: "USD" } }),
        row({ txnId: "fin-1", amount: 4, detail: { tradeStatus: "1", side: "1", paymentId: "P1", basicAmount: 4, basicCurrency: "USD" } }),
      ],
      DAY_START,
      MONTH_START,
    );
    expect(totals.monthSpend).toBe(4);
    expect(totals.countedTxns).toBe(1);
  });

  it("still counts an authorisation that has no settlement yet", () => {
    const totals = sumSpend(
      [row({ txnId: "auth-2", amount: 12, time: DAY_START + 1000, detail: { tradeStatus: "0", side: "1", paymentId: "P2", basicAmount: 12, basicCurrency: "USD" } })],
      DAY_START,
      MONTH_START,
    );
    expect(totals.daySpend).toBe(12);
    expect(totals.monthSpend).toBe(12);
  });

  it("excludes refunds, reversals and failed rows", () => {
    const totals = sumSpend(
      [
        row({ txnId: "r1", amount: 30, detail: { tradeStatus: "1", side: "3", paymentId: "R1", basicAmount: 30, basicCurrency: "USD" } }),
        row({ txnId: "r2", amount: 40, detail: { tradeStatus: "3", side: "1", paymentId: "R2", basicAmount: 40, basicCurrency: "USD" } }),
        row({ txnId: "r3", amount: 50, detail: { tradeStatus: "2", side: "1", paymentId: "R3", basicAmount: 50, basicCurrency: "USD" } }),
      ],
      DAY_START,
      MONTH_START,
    );
    expect(totals.monthSpend).toBe(0);
  });

  it("ignores duplicate page rows and rows outside the month window", () => {
    const dup = row({ txnId: "d1", amount: 100, detail: { tradeStatus: "1", side: "1", paymentId: "D1", basicAmount: 100, basicCurrency: "USD" } });
    const totals = sumSpend(
      [dup, dup, row({ txnId: "old", amount: 500, time: Date.UTC(2026, 6, 20), detail: { tradeStatus: "1", side: "1", paymentId: "OLD", basicAmount: 500, basicCurrency: "USD" } })],
      DAY_START,
      MONTH_START,
    );
    expect(totals.monthSpend).toBe(100);
  });

  it("never sums a non-USD amount as dollars", () => {
    const totals = sumSpend(
      [row({ txnId: "eur", amount: 90, currency: "EUR", detail: { tradeStatus: "1", side: "1", paymentId: "E1", basicAmount: 90, basicCurrency: "EUR" } })],
      DAY_START,
      MONTH_START,
    );
    expect(totals.monthSpend).toBe(0);
    expect(totals.skippedNonUsd).toBe(1);
  });

  it("uses the USD-denominated field when the local amount is foreign", () => {
    const totals = sumSpend(
      [row({ txnId: "mix", amount: 0, detail: { tradeStatus: "1", side: "1", paymentId: "M1", basicAmount: 25.37, basicCurrency: "USD", localAmount: 800, localCurrency: "EGP" } })],
      DAY_START,
      MONTH_START,
    );
    expect(totals.monthSpend).toBeCloseTo(25.37, 10);
  });

  it("reproduces the reported case: actual 1246 is not reported as 1250", () => {
    const rows: SpendRow[] = [];
    for (let i = 0; i < 623; i++) {
      rows.push(row({ txnId: `f${i}`, amount: 2, detail: { tradeStatus: "1", side: "1", paymentId: `PX${i}`, basicAmount: 2, basicCurrency: "USD" } }));
      // Bybit also archived the authorisation copy of the same purchase.
      rows.push(row({ txnId: `a${i}`, amount: 2, detail: { tradeStatus: "0", side: "1", paymentId: `PX${i}`, basicAmount: 2, basicCurrency: "USD" } }));
    }
    // Two extra authorisation-only rows worth $2 each that were double counted before.
    const totals = sumSpend(rows, DAY_START, MONTH_START);
    expect(totals.monthSpend).toBe(1246);
  });

  it("subtracts a fee that is included inside the total amount", () => {
    const totals = sumSpend(
      [row({ txnId: "fee1", amount: 16.54, detail: { tradeStatus: "1", side: "1", paymentId: "F1", basicAmount: 16.54, basicCurrency: "USD", foreignTxnFee: 0.32 } })],
      DAY_START,
      MONTH_START,
    );
    expect(totals.monthSpend).toBeCloseTo(16.22, 10);
  });

  it("does not subtract the fee twice when the API already separates it", () => {
    const totals = sumSpend(
      [
        row({
          txnId: "fee2",
          amount: 16.54,
          detail: { tradeStatus: "1", side: "1", paymentId: "F2", basicAmount: 16.22, basicCurrency: "USD", transactionAmount: 16.54, transactionCurrency: "USD", foreignTxnFee: 0.32 },
        }),
      ],
      DAY_START,
      MONTH_START,
    );
    expect(totals.monthSpend).toBeCloseTo(16.22, 10);
  });

  it("counts duplicated fee field names once", () => {
    const totals = sumSpend(
      [row({ txnId: "fee3", amount: 10.5, detail: { tradeStatus: "1", side: "1", paymentId: "F3", basicAmount: 10.5, basicCurrency: "USD", foreignTxnFee: 0.5, feeAmount: 0.5 } })],
      DAY_START,
      MONTH_START,
    );
    expect(totals.monthSpend).toBeCloseTo(10, 10);
  });



  it("per-card spend uses the same collapsing rules", () => {
    const perCard = sumSpendByCard(
      [
        { ...row({ txnId: "c-auth", amount: 7, detail: { tradeStatus: "0", side: "1", paymentId: "C1", basicAmount: 7, basicCurrency: "USD" } }), pan4: "4321" },
        { ...row({ txnId: "c-fin", amount: 7, detail: { tradeStatus: "1", side: "1", paymentId: "C1", basicAmount: 7, basicCurrency: "USD" } }), pan4: "4321" },
      ] as Array<SpendRow & { pan4: string }>,
      (r) => (r as SpendRow & { pan4: string }).pan4,
    );
    expect(perCard.get("4321")?.spend).toBe(7);
    expect(perCard.get("4321")?.countedTxns).toBe(1);
  });
});
