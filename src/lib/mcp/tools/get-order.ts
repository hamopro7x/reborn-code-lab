import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "get_order",
  title: "Get order",
  description: "Get one order and its line items by order code, for orders the signed-in user is allowed to see.",
  inputSchema: {
    order_code: z.string().describe("The order code, e.g. 'ORD-A1B2C3D4'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ order_code }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_code, status, customer_name, customer_email, customer_phone, customer_country, currency_code, subtotal, discount_amount, total, admin_notes, created_at, confirmed_at")
      .eq("order_code", order_code)
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult(`No order found with code "${order_code}".`);
    const { data: items } = await supabase
      .from("order_items")
      .select("product_name, quantity, unit_price, warranty_days")
      .eq("order_id", data.id);
    return jsonResult({ ...data, items: items ?? [] });
  },
});
