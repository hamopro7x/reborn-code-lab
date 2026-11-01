import { describe, it, expect } from "vitest";
import { resolveReversals, type LinkCandidate } from "./bybit-spend";

// Real shapes from card 0540 (stored detail): A completed, B pending retry 3s later,
// R side-2 reversal ~21 min later with its own ids. Two accounts synced together.
function group(scope: string, base: number, amt: number, tag: string, extra: Partial<Record<"A"|"B"|"R", Partial<LinkCandidate>>> = {}): LinkCandidate[] {
  const row = (id: string, side: string, ts: string, t: number, k: "A"|"B"|"R"): LinkCandidate => ({
    id, scope, orderNo: `o-${id}`, txnId: id, side, tradeStatus: ts, pan4: "0540", amount: amt, time: base + t, ...extra[k],
  });
  return [row(`${tag}A`, "1", "1", 0, "A"), row(`${tag}B`, "1", "0", 3000, "B"), row(`${tag}R`, "2", "1", 21 * 60_000, "R")];
}
const H = 3_600_000;
const rows = (o: Parameters<typeof group>[4] = {}) => [
  ...group("acc1", 0, 2.79, "g279", o), ...group("acc1", 3 * H, 3.61, "g361"), ...group("acc1", 5 * H, 3.08, "g308"),
  ...group("acc2", 3 * H, 3.61, "x361"),
];

describe("reversal review queue", () => {
  it("ambiguous groups are never guessed: both purchases stay, one review per reversal", () => {
    const r = resolveReversals(rows());
    expect(r.voided.size).toBe(0);
    expect(r.review.map((x) => x.reversalId).sort()).toEqual(["g279R", "g308R", "g361R", "x361R"]);
    expect(r.review.find((x) => x.reversalId === "x361R")!.candidateIds.sort()).toEqual(["x361A", "x361B"]);
  });
  it("admin decision voids exactly the chosen purchase and clears the review", () => {
    const list = rows();
    list.find((x) => x.id === "g361R")!.resolvedVoid = "g361B";
    const r = resolveReversals(list);
    expect([...r.voided]).toEqual(["g361B"]);
    expect(r.review.some((x) => x.reversalId === "g361R")).toBe(false);
  });
  it("'none' decision voids nothing and clears the review", () => {
    const list = rows();
    list.find((x) => x.id === "g308R")!.resolvedVoid = "none";
    const r = resolveReversals(list);
    expect(r.voided.size).toBe(0);
    expect(r.review.some((x) => x.reversalId === "g308R")).toBe(false);
  });
  it("decision persists when Bybit changes the pending tradeStatus on resync", () => {
    const list = rows({ B: { tradeStatus: "1" } });
    list.find((x) => x.id === "g279R")!.resolvedVoid = "g279A";
    expect(resolveReversals(list).voided.has("g279A")).toBe(true);
  });
  it("manual owner confirmation (2.79) wins over a legacy mark on the other purchase", () => {
    const r = resolveReversals(rows({ A: { presetVoid: "manual" }, B: { presetVoid: "legacy" } }));
    expect(r.voided.has("g279A")).toBe(true);
    expect(r.review.some((x) => x.reversalId === "g279R")).toBe(false);
  });
  it("legacy mark is kept but sent to review", () => {
    const r = resolveReversals(rows({ B: { presetVoid: "legacy" } }));
    expect(r.voided.has("g279B")).toBe(true);
    expect(r.review.find((x) => x.reversalId === "g279R")!.legacyId).toBe("g279B");
  });
  it("shared provider id auto-links", () => {
    const r = resolveReversals(rows({ R: { orderNo: "o-g279B" } }));
    expect(r.voided.has("g279B")).toBe(true);
  });
  it("a unique candidate auto-links, and never across accounts", () => {
    const list = [...group("acc1", 0, 1.5, "u").filter((x) => x.id !== "uB"), ...group("acc2", 0, 1.5, "v").filter((x) => x.id === "vA")];
    const r = resolveReversals(list);
    expect([...r.voided]).toEqual(["uA"]);
  });
});
