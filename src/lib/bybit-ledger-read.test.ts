import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requests, response } = vi.hoisted(() => ({
  requests: [] as URL[],
  response: { fail: false, pastEnd: false, createdAt: "2026-10-31T18:17:50Z", confirmationState: null as string | null },
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
            return new Response(JSON.stringify({ message: "ledger read unavailable" }), { status: 400 });
          }
          if (response.pastEnd && Number(url.searchParams.get("offset") ?? 0) > 0) {
            return new Response(JSON.stringify({ code: "PGRST103", message: "Requested range not satisfiable" }), {
              status: 416, headers: { "content-type": "application/json", "content-range": "*/1" },
            });
          }
          const ledger = {
            id: "movement", account_id: "account", kind: "card", status: "success", direction: "out",
            ref_id: "txn", title: "TikTok", amount: -12, currency: "USD", fee: 0,
            created_at: response.createdAt,
            occurred_at: "2026-10-31T18:17:50Z", detail: { side: "1", tradeStatus: "1", confirmationState: response.confirmationState },
          };
          const filterKey = table === "bybit_ledger" ? "or" : "bybit_ledger.or";
          const visibility = url.searchParams.getAll(filterKey).find((f) => f.includes("confirmationState"));
          const readable = !visibility || response.confirmationState === "confirmed" ||
            (visibility.includes("created_at.lt.2026-11-01T02:24:55Z") && response.confirmationState == null &&
              Date.parse(response.createdAt) < Date.parse("2026-11-01T02:24:55Z"));
          const rows = !readable ? [] : table === "bybit_ledger" ? [ledger]
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
    vi.setSystemTime(new Date("2026-10-31T18:21:00Z"));
    requests.length = 0;
    response.fail = false;
    response.pastEnd = false;
    response.createdAt = "2026-10-31T18:17:50Z";
    response.confirmationState = null;
  });
  afterEach(() => vi.useRealTimers());

  it("reads saved central purchases using a real Supabase query builder and the fixed reset boundary", async () => {
    const page = await fetchLedgerPage({ group: "txns", status: "all", page: 1 });
    expect(page.total).toBe(1);
    expect(page.rows[0]).toMatchObject({ id: "movement", amount: -12, status: "success" });
    const query = requests.find((url) => url.pathname.endsWith("/bybit_ledger"));
    expect(query?.searchParams.get("select")).toBe("*");
    expect(query?.searchParams.getAll("occurred_at")).toEqual([
      "gte.2026-10-31T00:00:00.000Z", "lt.2026-11-30T00:00:00.000Z",
    ]);
    expect(query?.searchParams.get("kind")).toBe("in.(card,refund)");
    // A side-2 reversal stays in the raw archive but must not be returned
    // as an extra central purchase, including when success/failed filters apply.
    expect(query?.searchParams.getAll("detail")).toEqual([
      'not.cs.{"side":"2"}',
      'not.cs.{"side":2}',
    ]);
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

  it("keeps new unconfirmed cards out of central and employee reads",async()=>{
    response.createdAt="2026-11-01T02:24:55Z";
    expect((await fetchLedgerPage({group:"txns"})).total).toBe(0);
    expect((await workTable({userId:"employee",shiftId:"shift"})).total).toBe(0);
  });

  it("never restores an explicitly waiting legacy card as successful work",async()=>{
    response.confirmationState="waiting";
    expect((await fetchLedgerPage({group:"txns"})).rows).toEqual([]);
    expect((await workTable({userId:"employee",shiftId:"shift"})).rows).toEqual([]);
  });

  it("shows an empty page with the real total when the open page is past the end, not an error", async () => {
    response.pastEnd = true;
    const central = await fetchLedgerPage({ group: "txns", status: "all", page: 4, pageSize: 50 });
    expect(central.rows).toEqual([]);
    expect(central.total).toBe(1);
    const shift = await workTable({ userId: "employee", shiftId: "shift", page: 4, pageSize: 50 });
    expect(shift.rows).toEqual([]);
    expect(shift.total).toBe(1);
  });
});
