import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => ({ select: () => ({ eq: (_field: string, value: string) => ({ maybeSingle: async () => ({ data: { provider: value === "account-a" ? "okx" : "bybit" } }) }) }) }),
  rpc: async () => ({ data: [{ api_key: "test-key", api_secret: JSON.stringify({ okx: 1, secret: "test-secret", passphrase: "test-pass" }) }] }),
} }));
import { fetchOkxHistory } from "./okx.server";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("OKX history requests", () => {
  it("reads only the selected account's provider endpoint and filters older cycle rows", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11T01:23:00Z"));
    const request = vi.fn(async () => new Response(JSON.stringify({ code: "0", data: [
      { billId: "old", ts: "1793318400000", balChg: "10" },
      { billId: "new", ts: "1794358800000", balChg: "-2", ccy: "USDT" },
    ] })));
    vi.stubGlobal("fetch", request);
    const result = await fetchOkxHistory("account-a", "funding", "SPOT");
    expect(result.rows.map((r) => r.id)).toEqual(["new"]);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.okx.com/api/v5/asset/bills?limit=100");
    expect(options.method).toBe("GET");
  });
  it("rejects a non-OKX account before any provider call", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await expect(fetchOkxHistory("account-b", "orders", "SPOT")).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("propagates provider failure instead of claiming empty records", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "50120", msg: "read required" }))));
    await expect(fetchOkxHistory("account-a", "bills", "SPOT")).rejects.toMatchObject({ code: "50120" });
  });
});