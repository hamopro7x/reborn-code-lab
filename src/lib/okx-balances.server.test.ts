import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { provider: "okx" } }) }) }) }),
  rpc: async () => ({ data: [{ api_key: "test-key", api_secret: JSON.stringify({ okx: 1, secret: "test-secret", passphrase: "test-pass" }) }] }),
} }));
import { fetchOkxBalances } from "./okx.server";

afterEach(() => vi.unstubAllGlobals());
function mockBalances(valuation: unknown[], funding: unknown[] = [], trading: unknown[] = [], failValuation = false) {
  const request = vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    const data = path === "/api/v5/asset/balances" ? funding : path === "/api/v5/account/balance" ? trading : valuation;
    return new Response(JSON.stringify(path.endsWith("asset-valuation") && failValuation ? { code: "50120", msg: "unavailable" } : { code: "0", data }));
  });
  vi.stubGlobal("fetch", request);
  return request;
}
describe("OKX overview balances", () => {
  it("uses the official 7.65 USD overview, not only USDT or summed components", async () => {
    const request = mockBalances([{ totalBal: "7.65" }], [{ ccy: "USDG", bal: "2" }], [{ totalEq: "3", details: [{ ccy: "USDT", cashBal: "3", eqUsd: "3" }] }]);
    const result = await fetchOkxBalances("account-a");
    expect(result.totalUsd).toBe(7.65);
    expect(result.coins.find(c => c.coin === "USDG")?.total).toBe(2);
    expect(request.mock.calls.some(([url]) => url === "https://www.okx.com/api/v5/asset/asset-valuation?ccy=USD")).toBe(true);
  });
  it("includes USDG funding in the fallback when valuation fails", async () => {
    mockBalances([], [{ ccy: "USDG", bal: "7.65" }], [], true);
    expect((await fetchOkxBalances("account-a")).totalUsd).toBe(7.65);
  });
  it("accepts a real zero overview without substituting older component balances", async () => {
    mockBalances([{ totalBal: "0" }], [{ ccy: "USDT", bal: "7.65" }]);
    expect((await fetchOkxBalances("account-a")).totalUsd).toBe(0);
  });
  it("does not treat missing valuation as a zero balance", async () => {
    mockBalances([{}], [{ ccy: "USDT", bal: "7.65" }]);
    expect((await fetchOkxBalances("account-a")).totalUsd).toBe(7.65);
  });
});