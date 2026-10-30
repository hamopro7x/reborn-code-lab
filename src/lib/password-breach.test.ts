import { describe, expect, it } from "vitest";
import { BREACHED_PASSWORD_MESSAGE, rangeHasSuffix, assertPasswordNotBreached } from "./password.functions";

describe("breached password range lookup", () => {
  it("detects a known suffix with count > 0", () => {
    const text = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8:1\nABCDEF0123:5";
    expect(rangeHasSuffix(text, "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8")).toBe(true);
  });

  it("ignores zero-count entries and unknown suffixes", () => {
    const text = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8:0\nABCDEF0123:5";
    expect(rangeHasSuffix(text, "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8")).toBe(false);
    expect(rangeHasSuffix(text, "0000000000000000000000000000000000000000")).toBe(false);
  });

  it("rejects a password that appears in a real HIBP range response", async () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8 → prefix 5BAA6
    const real = await (await fetch("https://api.pwnedpasswords.com/range/5BAA6")).text();
    await expect(assertPasswordNotBreached("password")).rejects.toThrow(BREACHED_PASSWORD_MESSAGE);
    expect(rangeHasSuffix(real, "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toBe(true);
  });

  it("accepts a password that is not in a leaked range", async () => {
    await expect(
      assertPasswordNotBreached("MgPro-2026-x7!unknown-passphrase-9f2c"),
    ).resolves.toBeUndefined();
  });
});
