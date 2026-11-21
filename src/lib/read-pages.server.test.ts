import { describe, expect, it } from "vitest";
import { readPages } from "./read-pages.server";
import { addWorkSummary, emptyWorkSummary } from "./work-summary";

describe("complete server-side shift aggregation", () => {
  it("reads beyond six pages sequentially and includes all 1401 transactions", async () => {
    const all = Array.from({ length: 1401 }, () => ({ amount: 2, work_txn_entries: { egp: 10, quantity: 0 } }));
    const summary = emptyWorkSummary();
    let active = 0;
    let peak = 0;
    let calls = 0;
    await readPages(async (from, to) => {
      active++; peak = Math.max(peak, active); calls++;
      await Promise.resolve(); active--;
      return { data: all.slice(from, to + 1), error: null };
    }, (rows) => rows.forEach((row) => addWorkSummary(summary, row)));
    expect(peak).toBe(1);
    expect(calls).toBe(8);
    expect(summary).toEqual({ count: 1401, amount: 2802, egp: 14010, entered: 1401 });
  });
  it("propagates a failed page rather than returning partial totals", async () => {
    await expect(readPages(async () => ({ data: null, error: { message: "unavailable" } }), () => {})).rejects.toThrow("unavailable");
  });
  it("counts entered zero and keeps refund amount display semantics", () => {
    const summary = emptyWorkSummary();
    addWorkSummary(summary, { amount: -3, work_txn_entries: [{ egp: 0, quantity: null }] });
    expect(summary).toEqual({ count: 1, amount: 3, egp: 0, entered: 1 });
  });
});