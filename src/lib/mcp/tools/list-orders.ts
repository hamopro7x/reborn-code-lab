import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "list_orders",
  title: "List orders",
  description: "List store orders visible to the signed-in user, newest first. Can be filtered by status and creation date range.",
  inputSchema: {
    status: z.string().optional().describe("Filter by order status, e.g. 'pending', 'confirmed', 'cancelled'."),
    from: z.string().optional().describe("Only orders created on or after this ISO date, e.g. '2026-07-01'."),
    to: z.string().optional().describe("Only orders created on or before this ISO date."),
    limit: z.number().int().optional().describe("Maximum number of orders to return. Defaults to 25."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, from, to, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const max = Math.min(Math.max(limit ?? 25, 1), 100);
    let query = supabaseForUser(ctx)
      .from("orders")
      .select("order_code, status, customer_name, customer_country, currency_code, subtotal, discount_amount, total, created_at, confirmed_at")
      .order("created_at", { ascending: false })
      .limit(max);
    if (status) query = query.eq("status", status as never);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult(data ?? []);
  },
});
