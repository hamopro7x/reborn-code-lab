import { describe, expect, it } from "vitest";
import { auditSpend, canonicalAmounts, canonicalize, getCanonicalTransactionIdentity, sumSpend, sumSpendByCard, type SpendRow } from "./bybit-spend";

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



  it("counts the full amount when the transaction has no fee", () => {
    const totals = sumSpend(
      [
        row({ txnId: "nf1", amount: 25, detail: { tradeStatus: "1", side: "1", paymentId: "N1", basicAmount: 25, basicCurrency: "USD" } }),
        row({ txnId: "nf2", amount: 12.4, detail: { tradeStatus: "1", side: "1", paymentId: "N2", basicAmount: 12.4, basicCurrency: "USD", foreignTxnFee: 0 } }),
      ],
      DAY_START,
      MONTH_START,
    );
    expect(totals.monthSpend).toBeCloseTo(37.4, 10);
  });

  it("ignores a fee reported in a non-USD currency", () => {
    const totals = sumSpend(
      [
        row({
          txnId: "nf3",
          amount: 20,
          detail: { tradeStatus: "1", side: "1", paymentId: "N3", basicAmount: 20, basicCurrency: "USD", foreignTxnFee: 5, feeCurrency: "EGP" },
        }),
      ],
      DAY_START,
      MONTH_START,
    );
    expect(totals.monthSpend).toBeCloseTo(20, 10);
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

// ---------------------------------------------------------------------------
// Canonical transaction identity / deduplication contract (cases 1..15).
// ---------------------------------------------------------------------------
describe("canonical transactions", () => {
  it("case 1+2: auth and settlement with different txnIds are ONE transaction", () => {
    const totals = sumSpend(
      [
        row({ txnId: "A123", amount: 20, detail: { tradeStatus: "0", side: "1", paymentId: "PAY-1", basicAmount: 20, basicCurrency: "USD" } }),
        row({ txnId: "B456", amount: 20, detail: { tradeStatus: "1", side: "1", paymentId: "PAY-1", basicAmount: 20, basicCurrency: "USD" } }),
      ],
      DAY_START,
      MONTH_START,
    );
    expect(totals.countedTxns).toBe(1);
    expect(totals.monthSpend).toBe(20);
  });

  it("case 3: shared paymentId collapses to one identity", () => {
    const a = row({ txnId: "x1", detail: { tradeStatus: "1", side: "1", paymentId: "SAME", basicAmount: 10, basicCurrency: "USD" } });
    const b = row({ txnId: "x2", detail: { tradeStatus: "1", side: "1", paymentId: "SAME", basicAmount: 10, basicCurrency: "USD" } });
    expect(getCanonicalTransactionIdentity(a)).toBe(getCanonicalTransactionIdentity(b));
    expect(sumSpend([a, b], DAY_START, MONTH_START).countedTxns).toBe(1);
  });

  it("case 4: shared orderNo with different txnIds collapses to one transaction", () => {
    const totals = sumSpend(
      [
        row({ txnId: "AUTH-9", amount: 33, detail: { tradeStatus: "0", side: "1", orderNo: "ORD-9", basicAmount: 33, basicCurrency: "USD" } }),
        row({ txnId: "FIN-9", amount: 33, detail: { tradeStatus: "1", side: "1", orderNo: "ORD-9", basicAmount: 33, basicCurrency: "USD" } }),
      ],
      DAY_START,
      MONTH_START,
    );
    expect(totals.countedTxns).toBe(1);
    expect(totals.monthSpend).toBe(33);
  });

  it("ignores placeholder identifiers instead of merging unrelated purchases", () => {
    const totals = sumSpend(
      [
        row({ txnId: "t-a", amount: 5, detail: { tradeStatus: "1", side: "1", paymentId: "0", basicAmount: 5, basicCurrency: "USD" } }),
        row({ txnId: "t-b", amount: 6, detail: { tradeStatus: "1", side: "1", paymentId: "null", basicAmount: 6, basicCurrency: "USD" } }),
      ],
      DAY_START,
      MONTH_START,
    );
    expect(totals.countedTxns).toBe(2);
    expect(totals.monthSpend).toBe(11);
  });

  it("case 5+6: authorisation alone counts once, settlement becomes the winner", () => {
    const auth = row({ txnId: "A", amount: 15, detail: { tradeStatus: "0", side: "1", orderId: "O-1", basicAmount: 15, basicCurrency: "USD" } });
    const authOnly = canonicalize([auth]);
    expect(authOnly.transactions.size).toBe(1);
    expect([...authOnly.transactions.values()][0]!.kind).toBe("authorised");

    const settled = row({ txnId: "F", amount: 15, detail: { tradeStatus: "1", side: "1", orderId: "O-1", basicAmount: 15, basicCurrency: "USD" } });
    const resolved = canonicalize([auth, settled]);
    expect(resolved.transactions.size).toBe(1);
    const winner = [...resolved.transactions.values()][0]!;
    expect(winner.kind).toBe("settled");
    expect(winner.winner.txnId).toBe("F");
    expect(winner.rawTxnIds).toHaveLength(2);
  });

  it("cases 7-9: refund, failed and reversed rows never reach spend", () => {
    const totals = sumSpend(
      [
        row({ txnId: "rf", amount: 10, detail: { tradeStatus: "1", side: "3", paymentId: "RF", basicAmount: 10, basicCurrency: "USD" } }),
        row({ txnId: "fl", amount: 10, detail: { tradeStatus: "2", side: "1", paymentId: "FL", basicAmount: 10, basicCurrency: "USD" } }),
        row({ txnId: "rv", amount: 10, detail: { tradeStatus: "3", side: "1", paymentId: "RV", basicAmount: 10, basicCurrency: "USD" } }),
      ],
      DAY_START,
      MONTH_START,
    );
    expect(totals.monthSpend).toBe(0);
    expect(totals.countedTxns).toBe(0);
  });

  it("case 10: the same transaction returned by two pages counts once", () => {
    const page1 = row({ txnId: "P-1", amount: 42, detail: { tradeStatus: "1", side: "1", paymentId: "DUP", basicAmount: 42, basicCurrency: "USD" } });
    const page2 = row({ txnId: "P-1", amount: 42, detail: { tradeStatus: "1", side: "1", paymentId: "DUP", basicAmount: 42, basicCurrency: "USD" } });
    const totals = sumSpend([page1, page2], DAY_START, MONTH_START);
    expect(totals.countedTxns).toBe(1);
    expect(totals.monthSpend).toBe(42);
  });

  it("case 11: gross + fee + net never deducts the fee twice", () => {
    const feeInclusive = canonicalAmounts(
      row({ txnId: "g1", amount: 16.54, detail: { tradeStatus: "1", side: "1", paymentId: "G1", basicAmount: 16.54, basicCurrency: "USD", foreignTxnFee: 0.32 } }),
    );
    expect(feeInclusive.spendUsd).toBeCloseTo(16.22, 10);
    expect(feeInclusive.fee).toBeCloseTo(0.32, 10);

    const alreadyNet = canonicalAmounts(
      row({
        txnId: "g2",
        amount: 16.54,
        detail: { tradeStatus: "1", side: "1", paymentId: "G2", basicAmount: 16.22, basicCurrency: "USD", transactionAmount: 16.54, transactionCurrency: "USD", foreignTxnFee: 0.32 },
      }),
    );
    expect(alreadyNet.spendUsd).toBeCloseTo(16.22, 10);
    expect(alreadyNet.netAmount).toBeCloseTo(16.22, 10);
  });

  it("case 12: foreign currency is never assumed to be USD", () => {
    const amounts = canonicalAmounts(
      row({ txnId: "fx", amount: 900, currency: "EGP", detail: { tradeStatus: "1", side: "1", paymentId: "FX", basicAmount: 900, basicCurrency: "EGP" } }),
    );
    expect(amounts.spendUsd).toBeNull();
    expect(amounts.currency).toBe("EGP");
    const totals = sumSpend(
      [row({ txnId: "fx", amount: 900, currency: "EGP", detail: { tradeStatus: "1", side: "1", paymentId: "FX", basicAmount: 900, basicCurrency: "EGP" } })],
      DAY_START,
      MONTH_START,
    );
    expect(totals.monthSpend).toBe(0);
    expect(totals.skippedNonUsd).toBe(1);
  });

  it("cases 13+14: window membership follows the transaction's own timestamp", () => {
    const lastSecond = Date.UTC(2026, 7, 31, 23, 59, 59, 999);
    const firstSecond = Date.UTC(2026, 8, 1, 0, 0, 0, 0);
    const august = sumSpend(
      [
        row({ txnId: "aug", amount: 10, time: lastSecond, detail: { tradeStatus: "1", side: "1", paymentId: "AUG", basicAmount: 10, basicCurrency: "USD" } }),
        row({ txnId: "sep", amount: 70, time: firstSecond, detail: { tradeStatus: "1", side: "1", paymentId: "SEP", basicAmount: 70, basicCurrency: "USD" } }),
      ],
      lastSecond,
      MONTH_START,
    );
    // August window: both rows are >= monthStart of August only for the August row.
    const septemberStart = Date.UTC(2026, 8, 1);
    const september = sumSpend(
      [
        row({ txnId: "aug", amount: 10, time: lastSecond, detail: { tradeStatus: "1", side: "1", paymentId: "AUG", basicAmount: 10, basicCurrency: "USD" } }),
        row({ txnId: "sep", amount: 70, time: firstSecond, detail: { tradeStatus: "1", side: "1", paymentId: "SEP", basicAmount: 70, basicCurrency: "USD" } }),
      ],
      septemberStart,
      septemberStart,
    );
    expect(august.monthSpend).toBe(80); // both belong to the August-onwards window
    expect(september.monthSpend).toBe(70); // only the 1st-of-September purchase
    expect(september.daySpend).toBe(70);
  });

  it("case 15: auth + financial + refund of one purchase never double counts", () => {
    const rows = [
      row({ txnId: "A", amount: 50, detail: { tradeStatus: "0", side: "1", paymentId: "MIX", basicAmount: 50, basicCurrency: "USD" } }),
      row({ txnId: "F", amount: 50, detail: { tradeStatus: "1", side: "1", paymentId: "MIX", basicAmount: 50, basicCurrency: "USD" } }),
      row({ txnId: "R", amount: 50, detail: { tradeStatus: "1", side: "3", paymentId: "MIX", basicAmount: 50, basicCurrency: "USD" } }),
    ];
    const totals = sumSpend(rows, DAY_START, MONTH_START);
    expect(totals.countedTxns).toBe(1);
    expect(totals.monthSpend).toBe(50);
  });

  it("audit explains why each raw row entered or missed monthly spend", () => {
    const audit = auditSpend(
      [
        row({ txnId: "A", amount: 9, detail: { tradeStatus: "0", side: "1", paymentId: "AU", basicAmount: 9, basicCurrency: "USD" } }),
        row({ txnId: "F", amount: 9, detail: { tradeStatus: "1", side: "1", paymentId: "AU", basicAmount: 9, basicCurrency: "USD" } }),
        row({ txnId: "R", amount: 9, detail: { tradeStatus: "1", side: "3", paymentId: "RB", basicAmount: 9, basicCurrency: "USD" } }),
      ],
      DAY_START,
      MONTH_START,
    );
    expect(audit.canonicalCount).toBe(1);
    expect(audit.entries.filter((e) => e.counted)).toHaveLength(1);
    expect(audit.entries.find((e) => e.rawTxnId === "F")?.counted).toBe(true);
    expect(audit.entries.find((e) => e.rawTxnId === "A")?.reason).toContain("duplicate");
    expect(audit.entries.find((e) => e.rawTxnId === "R")?.reason).toContain("excluded");
    expect(audit.totals.monthSpend).toBe(9);
  });

  it("account monthly spend equals the sum of the per-card spends", () => {
    const rows = [
      { ...row({ txnId: "c1a", amount: 11, detail: { tradeStatus: "0", side: "1", paymentId: "K1", basicAmount: 11, basicCurrency: "USD" } }), pan4: "1111" },
      { ...row({ txnId: "c1f", amount: 11, detail: { tradeStatus: "1", side: "1", paymentId: "K1", basicAmount: 11, basicCurrency: "USD" } }), pan4: "1111" },
      { ...row({ txnId: "c2f", amount: 4.5, detail: { tradeStatus: "1", side: "1", paymentId: "K2", basicAmount: 4.5, basicCurrency: "USD" } }), pan4: "2222" },
    ] as Array<SpendRow & { pan4: string }>;
    const account = sumSpend(rows, 0, 0);
    const perCard = sumSpendByCard(rows, (r) => (r as SpendRow & { pan4: string }).pan4);
    const cardTotal = [...perCard.values()].reduce((s, c) => s + c.spend, 0);
    expect(cardTotal).toBeCloseTo(account.monthSpend, 10);
    expect(cardTotal).toBeCloseTo(15.5, 10);
  });
});
