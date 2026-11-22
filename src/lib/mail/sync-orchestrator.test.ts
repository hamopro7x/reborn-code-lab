import { describe, expect, it } from "vitest";
import { syncLeaseUntil } from "./sync-orchestrator.server";

describe("Gmail per-account sync lease", () => {
  it("computes separate expiry times for separate account lock attempts", () => {
    const firstLock = new Date("2026-11-22T12:00:00.000Z");
    const laterLock = new Date("2026-11-22T12:02:00.000Z");
    expect(syncLeaseUntil(firstLock)).toBe("2026-11-22T12:01:30.000Z");
    expect(syncLeaseUntil(laterLock)).toBe("2026-11-22T12:03:30.000Z");
  });

  it("starts the lease window from the actual lock acquisition time", () => {
    const acquiredAt = new Date("2026-11-22T12:00:00.000Z");
    expect(syncLeaseUntil(acquiredAt)).toBe("2026-11-22T12:01:30.000Z");
  });
});
