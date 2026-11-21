import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ requests: [] as URL[], failPage: false }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: createClient("https://p2p-inbox.supabase.co", "fixture", {
  auth: { persistSession: false }, global: { fetch: async (input) => {
    const url = new URL(String(input)); state.requests.push(url);
    const table = url.pathname.split("/").at(-1);
    if (table === "bybit_ledger") {
      const cursor = Number(url.searchParams.get("or")?.match(/id\.lt\.row-(\d+)/)?.[1] ?? -1);
      if (state.failPage && cursor >= 0) return Response.json({ message: "unavailable" }, { status: 400 });
      const rows = Array.from({ length: 401 }, (_, i) => ({ id: `row-${i}`, kind: "p2p_buy", status: "اكتملت", occurred_at: new Date(Date.UTC(2026, 10, 21) - i * 1000).toISOString(), amount: 1, detail: {} }));
      return Response.json(rows.slice(cursor + 1, cursor + 201));
    }
    if (table === "work_p2p_effective_links") {
      const ids = (url.searchParams.get("ledger_id") ?? "").slice(4, -1).split(",");
      return Response.json(ids.filter((id) => id !== "row-400").map((id) => ({ id: `link-${id}`, ledger_id: id, user_id: "other" })));
    }
    return Response.json([]);
  } },
}) }));
import { completedP2P } from "./work.server";
beforeEach(() => { state.requests.length = 0; state.failPage = false; });
it("finds an unlinked order after two fully linked pages without exposing foreign shift links", async () => {
  const rows = await completedP2P(200, "employee");
  expect(rows.map((r) => r.ledgerId)).toEqual(["row-400"]);
  expect(rows[0]?.relatedShifts).toEqual([]);
  const queries = state.requests.filter((r) => r.pathname.endsWith("bybit_ledger"));
  expect(queries).toHaveLength(3);
  expect(queries[1]?.searchParams.get("or")).toContain("id.lt.row-199");
  expect(queries[2]?.searchParams.get("or")).toContain("id.lt.row-399");
  expect(queries.every((r) => r.searchParams.get("limit") === "200")).toBe(true);
});
it("keeps the admin's explicit recent inbox size and linked-order visibility", async () => {
  const rows = await completedP2P(200, "admin", true);
  expect(rows).toHaveLength(200);
  expect(rows[0]?.ledgerId).toBe("row-0");
  expect(state.requests.filter((r) => r.pathname.endsWith("bybit_ledger"))).toHaveLength(1);
});
it("reports a failed continuation rather than claiming an empty inbox", async () => {
  state.failPage = true;
  await expect(completedP2P(200, "employee")).rejects.toThrow("تعذر تحميل طلبات P2P");
});