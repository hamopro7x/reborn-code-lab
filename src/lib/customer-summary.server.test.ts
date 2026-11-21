import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import { customerSummary } from "./customer-summary.server";
it("counts 5201 orders beyond both the Data API default and former 5000 cap without changing currency grouping", async () => {
  const requests: URL[] = [];
  const orders = Array.from({ length: 5201 }, (_, i) => ({
    id: String(i), customer_email: "CUSTOMER@EXAMPLE.TEST", customer_name: i === 0 ? "Newest" : "Older", customer_phone: "fixture", customer_country: "EG",
    status: i === 5200 ? "pending_payment" : i % 2 ? "completed" : "confirmed", currency_code: i % 2 ? "USD" : "EGP", total: 2,
    created_at: new Date(Date.UTC(2026, 10, 21) - i * 1000).toISOString(),
  }));
  const db = createClient("https://customer-test.supabase.co", "fixture", { auth: { persistSession: false }, global: { fetch: async (input) => {
    const url = new URL(String(input)); requests.push(url);
    const from = Number(url.searchParams.get("offset")), limit = Number(url.searchParams.get("limit"));
    return Response.json(orders.slice(from, from + limit));
  } } });
  const result = await customerSummary(db);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ orders: 5201, confirmed: 5200, name: "Newest", total_by_currency: { USD: 5200, EGP: 5200 } });
  expect(requests).toHaveLength(27);
  expect(requests[26]?.searchParams.get("offset")).toBe("5200");
  expect(requests.every((r) => r.searchParams.get("limit") === "200")).toBe(true);
});
it("rejects partial aggregation on database failure", async () => {
  const db = createClient("https://customer-test.supabase.co", "fixture", { auth: { persistSession: false }, global: { fetch: async () => Response.json({ message: "unavailable" }, { status: 400 }) } });
  await expect(customerSummary(db)).rejects.toThrow("unavailable");
});