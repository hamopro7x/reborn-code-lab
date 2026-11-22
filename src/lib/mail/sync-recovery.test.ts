import { describe, expect, it } from "vitest";
import { reconcileDue } from "./sync-recovery.server";

describe("Gmail sync reconciliation cadence", () => {
  const minute = 60_000;

  it("runs when there has never been a successful sync", () => {
    expect(reconcileDue(null, 10 * minute)).toBe(true);
    expect(reconcileDue(undefined, 10 * minute)).toBe(true);
  });

  it("runs when the prior timestamp is invalid", () => {
    expect(reconcileDue("not-a-date", 10 * minute)).toBe(true);
  });

  it("does not repeat within the same minute", () => {
    expect(reconcileDue(new Date(10 * minute + 5_000).toISOString(), 10 * minute + 50_000)).toBe(false);
  });

  it("runs in a later minute", () => {
    expect(reconcileDue(new Date(10 * minute + 5_000).toISOString(), 11 * minute)).toBe(true);
  });
});
