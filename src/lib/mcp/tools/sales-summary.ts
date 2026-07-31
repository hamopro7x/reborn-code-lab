import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "sales_summary",
  title: "Sales summary",
  description: "Summarize orders over a date range: order counts by status plus total sales and discounts per currency.",
  inputSchema: {
    from: z.string().optional().describe("Start ISO date of the range, e.g. '2026-07-01'. Defaults to the last 30 days."),
    to: z.string().optional().describe("End ISO date of the range."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const start = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let query = supabaseForUser(ctx)
      .from("orders")
      .select("status, currency_code, subtotal, discount_amount, total, created_at")
      .gte("created_at", start);
    if (to) query = query.lte("created_at", to);
    const { data, error } = await query;
    if (error) return errorResult(error.message);

    const byStatus: Record<string, number> = {};
    const byCurrency: Record<string, { orders: number; sales: number; discounts: number }> = {};
    for (const o of data ?? []) {
      byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
      const c = (byCurrency[o.currency_code] ??= { orders: 0, sales: 0, discounts: 0 });
      c.orders += 1;
      c.sales += Number(o.total ?? 0);
      c.discounts += Number(o.discount_amount ?? 0);
    }
    return jsonResult({
      from: start,
      to: to ?? null,
      total_orders: data?.length ?? 0,
      orders_by_status: byStatus,
      totals_by_currency: byCurrency,
    });
  },
});
