import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "list_products",
  title: "List products",
  description: "List store products with prices, discounts, warranty and category. Supports a text search and an active-only filter.",
  inputSchema: {
    search: z.string().optional().describe("Optional text to match against product name or description."),
    active_only: z.boolean().optional().describe("Only return products that are currently active. Defaults to true."),
    limit: z.number().int().optional().describe("Maximum number of products to return. Defaults to 25."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, active_only, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const max = Math.min(Math.max(limit ?? 25, 1), 100);
    let query = supabaseForUser(ctx)
      .from("products")
      .select("id, slug, name, short_description, base_price_egp, discount_percent, warranty_days, active, featured, category:categories(name, slug)")
      .order("sort_order")
      .limit(max);
    if (active_only !== false) query = query.eq("active", true);
    if (search?.trim()) query = query.or(`name.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult(data ?? []);
  },
});
