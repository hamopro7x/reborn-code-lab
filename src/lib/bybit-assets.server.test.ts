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
  it("follows cursor pagination for deposits and withdrawals", async () => {
    const { call } = await import("./bybit-account.server");
    state.calls.length = 0;
    state.failPath = "";
    (call as any).mockReset();
    (call as any)
      .mockResolvedValueOnce({ rows: [{ txID: "dep-1", status: 3, successAt: "1764000000000" }], nextPageCursor: "dep-next" })
      .mockResolvedValueOnce({ rows: [{ txID: "dep-2", status: 1, successAt: "1764000001000" }] })
      .mockResolvedValueOnce({ rows: [{ withdrawId: "wd-1", status: "Pending", createTime: "1764000000000" }], nextPageCursor: "wd-next" })
      .mockResolvedValueOnce({ rows: [{ withdrawId: "wd-2", status: "success", createTime: "1764000001000" }] });
    const result = await fetchOnChain("account-a");
    expect(result.deposits).toHaveLength(2);
    expect(result.withdrawals).toHaveLength(2);
    expect(result.deposits.map(x => x.status)).toEqual(["ناجحة", "قيد التنفيذ"]);
    expect(result.withdrawals.map(x => x.status)).toEqual(["قيد التنفيذ", "ناجحة"]);
    expect(state.calls.map(x => x.params.cursor ?? null)).toEqual([null, "dep-next", null, "wd-next"]);
  });

  it("maps internal deposit processing and seconds timestamps correctly", async () => {
    const { call } = await import("./bybit-account.server");
    (call as any).mockReset();
    (call as any)
      .mockResolvedValueOnce({ rows: [{ id: "int-1", status: 1, createdTime: "1764000000" }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await fetchInternal("account-a");
    expect(result.deposits[0].status).toBe("قيد التنفيذ");
    expect(result.deposits[0].time).toBe(1764000000000);
  });

});
