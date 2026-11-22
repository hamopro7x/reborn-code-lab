import { describe, expect, it, vi } from "vitest";
import {
  cardRecordRank,
  isLateSettlementRecord,
  isUnsupportedCardTypeError,
  mergeCardTypeResults,
  preferRecord,
} from "./bybit-card-records";

describe("Bybit card record helpers", () => {
  it("ranks reversals above completed and pending records", () => {
    expect(cardRecordRank({ tradeStatus: "1" })).toBe(1);
    expect(cardRecordRank({ tradeStatus: "2" })).toBe(2);
    expect(cardRecordRank({ tradeStatus: "reversed", side: "1" })).toBe(3);
  });

  it("distinguishes unsupported query types from transient/auth errors", () => {
    expect(isUnsupportedCardTypeError(new Error("Bybit 10017: unsupported"))).toBe(true);
    expect(isUnsupportedCardTypeError(new Error("Bybit 10001: params error"))).toBe(true);
    expect(isUnsupportedCardTypeError(new Error("Bybit 10006: rate limited"))).toBe(false);
    expect(isUnsupportedCardTypeError(new Error("network timeout"))).toBe(false);
  });

  it("prefers a more final record before query priority and update time", () => {
    const current = { row: { tradeStatus: "1" }, sourcePriority: 4, updatedAt: 999 };
    expect(preferRecord(current, { tradeStatus: "2" }, 0, 1)).toBe(true);
    expect(preferRecord(current, { tradeStatus: "1" }, 4, 1000)).toBe(true);
    expect(preferRecord(current, { tradeStatus: "1" }, 3, 2000)).toBe(false);
  });

  it("filters late settlement copies and merges successful query types", () => {
    expect(isLateSettlementRecord({ side: "3" })).toBe(true);
    expect(isLateSettlementRecord({ side: "1" })).toBe(false);
    const warn = vi.fn();
    const rows = mergeCardTypeResults([
      { status: "fulfilled", value: { data: [{ txnId: "A", tradeStatus: "1", side: "1" }] } },
      { status: "rejected", reason: new Error("Bybit 10017: unsupported") },
      { status: "fulfilled", value: { data: [{ txnId: "A", tradeStatus: "2", side: "1" }, { txnId: "B", side: "3" }] } },
    ] as PromiseSettledResult<any>[], ["AUTH", "REFUND", "FINANCIAL"], warn);
    expect(rows).toHaveLength(1);
    expect(rows[0].tradeStatus).toBe("2");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("throws only when all query types fail", () => {
    const failure = new Error("Bybit 10017: unsupported");
    expect(() => mergeCardTypeResults(
      [{ status: "rejected", reason: failure }] as PromiseSettledResult<any>[],
      ["AUTH"],
      () => undefined,
    )).toThrow(failure);
  });
});
