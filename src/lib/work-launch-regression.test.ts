import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ requests: [] as URL[], failRead: false, failWrite: false, pinHash: "", lock: null as string | null, fails: 0 }));
vi.mock("@/integrations/supabase/client.server", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabaseAdmin: createClient("https://work-test.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
      const url = new URL(String(input)); state.requests.push(url);
      const table = url.pathname.split("/").at(-1);
      const write = init?.method === "POST" || init?.method === "PATCH";
      if ((table === "work_pins" && state.failRead && !write) || (write && state.failWrite)) {
        return new Response(JSON.stringify({ message: "Database unavailable" }), { status: 400 });
      }
      if (table === "work_pins") return new Response(JSON.stringify({ user_id: "employee", pin_hash: state.pinHash, pin_salt: "fixture", fail_count: state.fails, locked_until: state.lock }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.searchParams.get("select")?.includes("work_transfer_notes")) return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
      const from = Number(url.searchParams.get("offset") ?? 0), size = Number(url.searchParams.get("limit") ?? 200);
      const data = table === "work_txn_assignments"
        ? Array.from({ length: Math.max(0, Math.min(size, 1401 - from)) }, (_, i) => ({
          id: `assignment-${from + i}`, ledger_id: `ledger-${from + i}`, user_id: "employee", shift_id: "shift", occurred_at: "2026-11-20T00:00:00Z",
          bybit_ledger: { kind: "card", amount: 2, status: "success", work_txn_entries: { egp: 10, quantity: 0 } },
        })) : [];
      return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json", "content-range": `${from}-${from + Math.max(0, data.length - 1)}/1401` } });
    } },
  }) };
});
import { pinIsSet, savePin, verifyPin, workSheetSummary, workTable, listManualTxns, purgeEmptyManualTxns } from "./work.server";
beforeEach(async () => {
  state.requests.length = 0; state.failRead = false; state.failWrite = false; state.lock = null; state.fails = 0;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("fixture:123456"));
  state.pinHash = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
});
describe("launch shift pagination and PIN", () => {
  it("filters transfer direction and kind before the page, not after slicing", async () => {
    await workTable({ shiftId: "shift", kinds: ["deposit", "withdraw"], direction: "out", page: 2, pageSize: 50 });
    const query = state.requests[0];
    expect(query?.searchParams.get("bybit_ledger.direction")).toBe("eq.out");
    expect(query?.searchParams.get("bybit_ledger.kind")).toBe("in.(deposit,withdraw)");
    expect(query?.searchParams.get("offset")).toBe("50");
  });
  it("does not delete old empty employee rows when opening manual notes", async () => {
    await purgeEmptyManualTxns("employee");
    expect(state.requests).toHaveLength(0);
    const result = await listManualTxns("employee", "shift", { card: "wrong", page: 8 });
    expect(result.total).toBe(1401);
    expect(state.requests).toHaveLength(1);
    expect(state.requests[0]?.searchParams.get("offset")).toBe("1050");
    expect(state.requests[0]?.searchParams.get("card")).toBe("eq.wrong");
  });
  it("uses IANA Cairo day boundaries in the actual report query", async () => {
    await workTable({ userId: "employee", day: "2026-11-20" });
    expect(state.requests[0]?.searchParams.getAll("occurred_at")).toEqual(["gte.2026-11-19T22:00:00.000Z", "lt.2026-11-20T22:00:00.000Z"]);
  });
  it("returns only page 29 and the exact full count, with stable ordering and server card filtering", async () => {
    const page = await workTable({ userId: "employee", shiftId: "shift", page: 29, pageSize: 50, cardOnly: true, successOnly: true });
    expect(page.rows).toHaveLength(1); expect(page.total).toBe(1401);
    const query = state.requests.find((url) => url.pathname.endsWith("work_txn_assignments"));
    expect(query?.searchParams.get("offset")).toBe("1400");
    expect(query?.searchParams.get("bybit_ledger.kind")).toBe("in.(card,refund)");
    expect(query?.searchParams.get("order")).toBe("occurred_at.desc,id.desc");
    expect(state.requests.filter((url) => url.pathname.endsWith("work_txn_assignments"))).toHaveLength(1);
  });
  it("aggregates the entire shift without shipping all provider payloads to the browser", async () => {
    expect(await workSheetSummary("shift")).toEqual({ count: 1401, amount: 2802, egp: 14010, entered: 1401, externalNotes: 0 });
    expect(state.requests).toHaveLength(9);
    for (const query of state.requests.slice(0, 8)) {
      expect(query.searchParams.get("shift_id")).toBe("eq.shift");
      expect(query.searchParams.get("select")).toBe("id,bybit_ledger!inner(amount,work_txn_entries(egp,quantity))");
      expect(query.searchParams.get("limit")).toBe("200");
    }
  });
  it("never treats a PIN lookup outage as a missing PIN", async () => {
    state.failRead = true;
    await expect(pinIsSet("employee")).rejects.toThrow("تعذّر التحقق");
    await expect(verifyPin("employee", "123456")).rejects.toThrow("تعذّر التحقق");
  });
  it("does not claim successful PIN verification if its attempt reset failed", async () => {
    state.failWrite = true;
    await expect(verifyPin("employee", "123456")).rejects.toThrow("تعذّر إتمام التحقق");
  });
  it("keeps the five-attempt lockout and denies a locked user's valid PIN", async () => {
    state.lock = new Date(Date.now() + 300_000).toISOString();
    expect((await verifyPin("employee", "123456")).ok).toBe(false);
    expect(state.requests).toHaveLength(1);
  });
  it("uses insert-only for first-time PIN creation so simultaneous calls cannot overwrite it", async () => {
    expect((await savePin("employee", "123456", "employee", true)).ok).toBe(true);
    expect(state.requests[0]?.searchParams.has("on_conflict")).toBe(false);
  });
});