import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as Array<{ path: string; params: Record<string, unknown> }>,
  pages: new Map<number, any>(),
  failPath: "",
}));

vi.mock("./bybit-account.server", () => ({
  getCreds: vi.fn(async () => ({ key: "k", secret: "s" })),
  call: vi.fn(async (_method: string, path: string, params: Record<string, unknown>) => {
    state.calls.push({ path, params });
    if (state.failPath === path) throw new Error("provider unavailable");
    if (path.includes("/p2p/")) return state.pages.get(Number(params.page)) ?? { count: 0, items: [] };
    return { rows: [] };
  }),
}));
vi.mock("./monthly-cycle.server", () => ({
  currentBybitRows: (rows: any[]) => rows,
}));

import { fetchP2P, fetchOnChain, fetchInternal } from "./bybit-assets.server";

describe("Bybit asset sync completeness", () => {
  it("walks all P2P pages reported by the provider", async () => {
    state.calls.length = 0;
    state.failPath = "";
    state.pages = new Map([
      [1, { count: 31, items: Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1), side: 0 })) }],
      [2, { count: 31, items: [{ id: "31", side: 1 }] }],
    ]);
    const rows = await fetchP2P("account-a");
    expect(rows).toHaveLength(31);
    expect(state.calls.filter((c) => c.path.includes("/p2p/")).map((c) => c.params.page)).toEqual([1, 2]);
  });

  it("does not silently accept a partial P2P response", async () => {
    state.calls.length = 0;
    state.failPath = "";
    state.pages = new Map([
      [1, { count: 61, items: Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1), side: 0 })) }],
      [2, { count: 61, items: [] }],
    ]);
    await expect(fetchP2P("account-a")).rejects.toThrow("history incomplete");
  });

  it("propagates a failed later P2P page instead of returning earlier pages as complete", async () => {
    state.calls.length = 0;
    state.pages = new Map([
      [1, { count: 31, items: Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1), side: 0 })) }],
    ]);
    const { call } = await import("./bybit-account.server");
    (call as any).mockImplementationOnce(async () => state.pages.get(1))
      .mockImplementationOnce(async () => { throw new Error("provider unavailable"); });
    await expect(fetchP2P("account-a")).rejects.toThrow("provider unavailable");
  });

  it("propagates on-chain and internal partial failures", async () => {
    state.failPath = "/v5/asset/withdraw/query-record";
    await expect(fetchOnChain("account-a")).rejects.toThrow("provider unavailable");
    await expect(fetchInternal("account-a")).rejects.toThrow("provider unavailable");
    state.failPath = "";
  });
});
