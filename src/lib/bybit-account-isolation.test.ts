import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ requests: [] as URL[], accountIds: [] as string[] }));

vi.mock("@/integrations/supabase/client.server", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabaseAdmin: createClient("https://account-test.supabase.co", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const url = new URL(String(input));
          state.requests.push(url);
          if (url.pathname.endsWith("/bybit_account_get_keys")) {
            const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
            state.accountIds.push(String(body["p_account_id"]));
          }
          let rows: Record<string, unknown>[] = url.pathname.endsWith("/bybit_accounts") ? [
            { id: "bybit-a", name: "Primary", provider: "bybit", sort_order: 4 },
            { id: "legacy-b", name: "Legacy", provider: null, sort_order: 5 },
            { id: "retired-c", name: "Retired", provider: "retired", sort_order: 1 },
          ] : [];
          if (url.searchParams.has("or")) {
            rows = rows.filter((row) => row["provider"] == null || row["provider"] === "bybit");
          }
          if (url.searchParams.get("frozen") === "eq.true") rows = [];
          return new Response(JSON.stringify(rows), { headers: { "content-type": "application/json" } });
        },
      },
    }),
  };
});

import { listAccounts, syncAllRecent } from "./bybit.server";

describe("Bybit shared-table account isolation", () => {
  beforeEach(() => {
    state.requests.length = 0;
    state.accountIds.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T22:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("keeps Bybit and legacy accounts while excluding retired accounts from visa numbering", async () => {
    const accounts = await listAccounts();
    expect(accounts.map((row) => [row.id, row.sortOrder])).toEqual([["bybit-a", 4], ["legacy-b", 5]]);
    expect(state.requests.find((url) => url.searchParams.has("or"))?.searchParams.get("or"))
      .toBe("(provider.is.null,provider.eq.bybit)");
  });

  it("recent sync never asks for credentials belonging to a retired account", async () => {
    expect(await syncAllRecent()).toEqual({ saved: 0, accounts: 2, failedAccounts: [] });
    expect(state.accountIds.length).toBeGreaterThanOrEqual(2);
    expect([...new Set(state.accountIds)].sort()).toEqual(["bybit-a", "legacy-b"]);
    expect(state.requests.every((url) => url.hostname === "account-test.supabase.co")).toBe(true);
  });
});