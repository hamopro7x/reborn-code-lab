import { describe, expect, it } from "vitest";
import { detailText, sameStoredValue } from "./bybit-value-helpers";

describe("Bybit shared value helpers", () => {
  it("compares nullish values and exact scalar values", () => {
    expect(sameStoredValue(null, undefined)).toBe(true);
    expect(sameStoredValue(null, "0")).toBe(false);
    expect(sameStoredValue("success", "success")).toBe(true);
  });

  it("normalizes equivalent PostgreSQL and ISO timestamps", () => {
    expect(sameStoredValue("2026-11-01 02:30:00+00:00", "2026-11-01T02:30:00Z")).toBe(true);
    expect(sameStoredValue("2026-11-01T02:30:00Z", "2026-11-01T02:30:01Z")).toBe(false);
  });

  it("compares numeric strings and numbers without treating empty strings as zero", () => {
    expect(sameStoredValue("12.50", 12.5)).toBe(true);
    expect(sameStoredValue("", 0)).toBe(false);
    expect(sameStoredValue("not-a-number", "NaN")).toBe(false);
  });

  it("converts detail values to strings while preserving null", () => {
    expect(detailText(null)).toBeNull();
    expect(detailText(undefined)).toBeNull();
    expect(detailText(0)).toBe("0");
    expect(detailText(false)).toBe("false");
  });
});
