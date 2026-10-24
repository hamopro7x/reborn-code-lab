import { describe, expect, it } from "vitest";
import { resolveAppearance } from "./appearance";

describe("visitor appearance choice", () => {
  it("defaults to dark without an explicit choice", () => {
    expect(resolveAppearance(null)).toBe("dark");
    expect(resolveAppearance("system")).toBe("dark");
  });
  it("uses light only when explicitly saved", () => {
    expect(resolveAppearance("light")).toBe("light");
  });
  it("keeps an explicit dark choice", () => {
    expect(resolveAppearance("dark")).toBe("dark");
  });
});