import { describe, expect, it, vi } from "vitest";
import { accountLabels } from "./account-labels.server";

function accounts(data: Record<string, unknown>[], missingProvider = false) {
  let select = "";
  const query = {
    select: vi.fn((columns: string) => { select = columns; return query; }),
    order: vi.fn(() => query),
    then: (resolve: (result: { data: Record<string, unknown>[]; error: unknown }) => unknown) =>
      Promise.resolve(resolve({ data, error: missingProvider && select.includes("provider") ? { code: "42703" } : null })),
  };
  return { from: vi.fn(() => query), query };
}

describe("shared account labels preserve Bybit isolation", () => {
  it("preserves explicit visa numbers and account names", async () => {
    const db = accounts([{ id: "a", name: "Primary", sort_order: 7, provider: "bybit" }]);
    expect([...await accountLabels(db)]).toEqual([["a", "Primary (فيزا 7)"]]);
  });

  it("never labels retired-provider accounts as Bybit or counts them in visa numbering", async () => {
    const db = accounts([
      { id: "retired", name: "Retired", sort_order: 1, provider: "retired" },
      { id: "a", name: "Primary", sort_order: 0, provider: "bybit" },
    ]);
    expect([...await accountLabels(db)]).toEqual([["a", "Primary (فيزا 1)"]]);
  });

  it("preserves legacy null-provider Bybit accounts", async () => {
    const db = accounts([{ id: "a", name: "Legacy", sort_order: 0, provider: null }]);
    expect([...await accountLabels(db)]).toEqual([["a", "Legacy (فيزا 1)"]]);
  });

  it("preserves legacy schemas without the shared discriminator", async () => {
    const db = accounts([{ id: "a", name: "Legacy", sort_order: 3 }], true);
    expect([...await accountLabels(db)]).toEqual([["a", "Legacy (فيزا 3)"]]);
    expect(db.query.select.mock.calls.map(([columns]) => columns)).toEqual([
      "id,name,sort_order,provider", "id,name,sort_order",
    ]);
  });
});