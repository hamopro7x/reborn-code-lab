import { describe, expect, it } from "vitest";
import { BYBIT_FRESH_START_MS, currentBybitCycle, currentBybitRows, currentCycleStart, inCurrentCycle } from "./monthly-cycle.server";
import { spendWindows } from "./bybit.server";

const now = Date.parse("2026-10-29T19:08:00Z");

describe("Bybit fresh start after the owner's reset", () => {
  it("preserves the existing 29 October 21:45 Cairo reset instant", () => {
    expect(BYBIT_FRESH_START_MS).toBe(Date.parse("2026-10-29T18:45:30.757Z"));
    expect(currentCycleStart(now)).toBe(BYBIT_FRESH_START_MS);
  });

  it("rejects old transactions even if fetched again from Bybit", () => {
    expect(inCurrentCycle(Date.parse("2026-10-29T18:14:00Z"), now)).toBe(false);
    expect(inCurrentCycle(BYBIT_FRESH_START_MS - 1, now)).toBe(false);
  });

  it("includes transactions at and after the reset without moving the start", () => {
    expect(inCurrentCycle(BYBIT_FRESH_START_MS, now)).toBe(true);
    expect(inCurrentCycle(Date.parse("2026-10-29T19:00:00Z"), now)).toBe(true);
    expect(currentCycleStart(now + 60_000)).toBe(BYBIT_FRESH_START_MS);
  });

  it("filters every transaction type, including cached rows, without modifying it", () => {
    const rows = ["card", "p2p", "deposit", "withdraw", "internal_in", "internal_out"].flatMap((kind) => [
      { kind, id: `old-${kind}`, time: BYBIT_FRESH_START_MS - 1 },
      { kind, id: `new-${kind}`, time: BYBIT_FRESH_START_MS + 1 },
    ]);
    const visible = currentBybitRows(rows, now);
    expect(visible.map((row) => row.id)).toEqual(["new-card", "new-p2p", "new-deposit", "new-withdraw", "new-internal_in", "new-internal_out"]);
    expect(rows).toHaveLength(12);
  });

  it("spending uses the same reset boundary for day and month", () => {
    expect(spendWindows(now)).toEqual({
      dayStart: BYBIT_FRESH_START_MS,
      monthStart: BYBIT_FRESH_START_MS,
      monthEnd: Date.parse("2026-10-31T00:00:00Z"),
    });
  });

  it("keeps the monthly rollover and exclusive end", () => {
    const next = Date.parse("2026-10-31T00:00:00Z");
    expect(inCurrentCycle(currentBybitCycle(now).periodEnd, now)).toBe(false);
    expect(currentCycleStart(next)).toBe(next);
  });

  it("does not admit missing or invalid provider timestamps", () => {
    expect(currentBybitRows([{ time: 0 }, { time: NaN }, { time: Infinity }], now)).toEqual([]);
  });
});