import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  responses: new Map<string, any[]>(),
  calls: [] as Array<{ type: string; page: number }>,
  failures: new Map<string, Error>(),
}));

vi.mock("crypto", () => ({ createHmac: () => ({ update: () => ({ digest: () => "signature" }) }) }));
vi.mock("./bybit-account.server", () => ({ getCreds: vi.fn(async () => ({ key: "k", secret: "s" })) }));
vi.mock("./bybit-card-mapper", () => ({ cardRowKey: (row: any) => String(row.txnId ?? row.id) }));
vi.mock("./bybit-runtime", () => ({ BYBIT_BASE_URL: "https://api-testnet.bybit.com", BYBIT_RECV_WINDOW: "5000", sleep: vi.fn(async () => {}) }));
vi.mock("./bybit-spend", () => ({ isExplicitReversal: () => false }));
vi.mock("./monthly-cycle.server", () => ({ currentBybitCycle: () => ({ periodStart: 0, periodEnd: Number.MAX_SAFE_INTEGER }) }));
vi.mock("./bybit-cache.server", () => ({ cardCache: new Map(), cardInflight: new Map() }));

import { fetchCardPages, isLateSettlementRecord } from "./bybit-card-api.server";

afterEach(() => {
  vi.restoreAllMocks();
  state.calls.length = 0;
  state.responses.clear();
  state.failures.clear();
});

describe("Bybit card pagination completeness", () => {
  it("walks all pages for every query type", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      state.calls.push({ type: body.type, page: body.page });
      const key = body.type + ":" + body.page;
      const response = state.responses.get(key) ?? [{ txnId: key, txnCreate: body.page }];
      const totalCount = body.page === 1 ? 101 : 101;
      return new Response(JSON.stringify({ retCode: 0, result: {
        pageNo: body.page, pageSize: 100, totalCount, data: response,
      }}), { status: 200 });
    }));
    for (const type of ["SIDE_QUERY_AUTH", "SIDE_QUERY_AUTH_ALL", "SIDE_QUERY_FINANCIAL_ALL", "SIDE_QUERY_FINANCIAL_REFUND", "SIDE_QUERY_AUTH_REVERSAL"]) {
      state.responses.set(type + ":1", Array.from({ length: 100 }, (_, i) => ({ txnId: type + "-1-" + i, txnCreate: 1 })));
      state.responses.set(type + ":2", [{ txnId: type + "-2", txnCreate: 2 }]);
    }
    const rows = await fetchCardPages(200, { key: "k", secret: "s" }, undefined, 10_000);
    expect(rows).toHaveLength(505);
    expect(state.calls).toHaveLength(10);
    expect(state.calls.filter(x => x.page === 2)).toHaveLength(5);
  });

  it("fails rather than returning a partial result when the page budget is exhausted", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 150));
      const body = JSON.parse(init.body);
      return new Response(JSON.stringify({ retCode: 0, result: {
        pageNo: body.page, pageSize: 100, totalCount: 500, data: Array.from({ length: 100 }, (_, i) => ({ txnId: body.type + "-" + body.page + "-" + i, txnCreate: i + 1 })),
      }}), { status: 200 });
    }));
    await expect(fetchCardPages(500, { key: "k", secret: "s" }, undefined, 100)).rejects.toThrow("time budget expired");
    expect(calls).toBe(1);
  });
});


describe("Bybit documented movement types", () => {
  it("does not classify side 3 transactions or side 13 ATM withdrawals as discardable duplicates", () => {
    expect(isLateSettlementRecord({ side: "3" })).toBe(false);
    expect(isLateSettlementRecord({ side: "13" })).toBe(false);
  });
});
