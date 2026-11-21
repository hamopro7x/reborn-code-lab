import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
const requests = vi.hoisted(() => [] as URL[]);
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: createClient("https://selector-test.supabase.co", "fixture", {
  auth: { persistSession: false }, global: { fetch: async (input) => {
    const url = new URL(String(input)); requests.push(url);
    const table = url.pathname.split("/").at(-1);
    const from = Number(url.searchParams.get("offset")), limit = Number(url.searchParams.get("limit"));
    if (table === "work_shifts") return Response.json(Array.from({ length: 201 }, (_, i) => ({
      id: `shift-${i}`, started_at: new Date(Date.UTC(2026, 10, 21) - i * 1000).toISOString(), ended_at: null,
    })).slice(from, from + limit));
    if (table === "work_txn_assignments") {
      const ids = (url.searchParams.get("shift_id") ?? "").slice(4, -1).split(",");
      const all = ids.includes("shift-0") ? Array.from({ length: 1201 }, (_, i) => ({ id: `a-${i}`, shift_id: "shift-0" })) : [];
      return Response.json(all.slice(from, from + limit));
    }
    return Response.json([]);
  } },
}) }));
import { shiftHistory } from "./work.server";
it("preserves all 201 selector shifts and all 1201 assignment counts with bounded pages/ID lists", async () => {
  const shifts = await shiftHistory("employee");
  expect(shifts).toHaveLength(201);
  expect(shifts[0]?.txns).toBe(1201);
  expect(shifts[200]?.id).toBe("shift-200");
  for (const query of requests) {
    if (query.searchParams.get("shift_id")?.startsWith("in.(")) expect(query.searchParams.get("shift_id")?.split(",").length).toBeLessThanOrEqual(100);
  }
  expect(requests.filter((r) => r.pathname.endsWith("work_shifts"))).toHaveLength(2);
});