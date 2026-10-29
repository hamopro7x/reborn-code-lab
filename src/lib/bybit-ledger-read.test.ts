import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requests, response } = vi.hoisted(() => ({
  requests: [] as URL[],
  response: { fail: false },
}));

vi.mock("@/integrations/supabase/client.server", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabaseAdmin: createClient("https://ledger-test.supabase.co", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input) => {
          const url = new URL(String(input));
          requests.push(url);
          const table = url.pathname.split("/").at(-1);
          if (table === "bybit_ledger" && response.fail) {
            return new Response(JSON.stringify({ message: "ledger read unavailable" }), { status: 503 });
          }
          const ledger = {
            id: "movement", account_id: "account", kind: "card", status: "success", direction: "out",
            ref_id: "txn", title: "TikTok", amount: -12, currency: "USD", fee: 0,
            occurred_at: "2026-10-29T19:17:50Z", detail: { side: "1", tradeStatus: "1" },
          };
          const rows = table === "bybit_ledger" ? [ledger]
            : table === "work_txn_assignments" ? [{
              id: "assignment", ledger_id: "movement", shift_id: "shift", user_id: "employee",
              kind: "card", assign_mode: "auto", assigned_at: ledger.occurred_at,
              occurred_at: ledger.occurred_at, bybit_ledger: ledger,
            }] : [];
          return new Response(JSON.stringify(rows), {
            status: 200, headers: { "content-type": "application/json", "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
          });
        },
      },
    }),
  };
});

import { fetchLedgerPage } from "./bybit.server";
import { workTable } from "./work.server";

describe("saved Bybit movements remain readable in central and shift lists", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T19:21:00Z"));
    requests.length = 0;
    response.fail = false;
  });
  afterEach(() => vi.useRealTimers());

  it("reads saved central purchases using a real Supabase query builder and the fixed reset boundary", async () => {
    const page = await fetchLedgerPage({ group: "txns", status: "all", page: 1 });
    expect(page.total).toBe(1);
    expect(page.rows[0]).toMatchObject({ id: "movement", amount: -12, status: "success" });
    const query = requests.find((url) => url.pathname.endsWith("/bybit_ledger"));
    expect(query?.searchParams.get("select")).toBe("*");
    expect(query?.searchParams.getAll("occurred_at")).toEqual([
      "gte.2026-10-29T18:45:30.757Z", "lt.2026-10-31T00:00:00.000Z",
    ]);
    expect(query?.searchParams.get("kind")).toBe("in.(card,refund)");
  });

  it("reads the same saved movement through the employee's existing shift assignment", async () => {
    const page = await workTable({ userId: "employee", shiftId: "shift", successOnly: true });
    expect(page.total).toBe(1);
    expect(page.rows[0]).toMatchObject({ ledgerId: "movement", shiftId: "shift", amount: -12 });
    const query = requests.find((url) => url.pathname.endsWith("/work_txn_assignments"));
    expect(query?.searchParams.get("shift_id")).toBe("eq.shift");
    expect(query?.searchParams.get("user_id")).toBe("eq.employee");
  });

  it("reports a ledger read failure rather than returning an empty successful page", async () => {
    response.fail = true;
    await expect(fetchLedgerPage({ group: "txns" })).rejects.toThrow("ledger read unavailable");
  });
});