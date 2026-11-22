import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const getSchema = z.object({ order_code: z.string().min(4).max(40) });

/**
 * Public order tracking deliberately returns only fields rendered on the
 * customer tracking page. Contact details and payment destination details
 * must remain private to the admin panel.
 */
export const getOrderByCode = createServerFn({ method: "GET" })
  .inputValidator((data) => getSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, order_code, status, customer_name, currency_code, total, created_at")
      .eq("order_code", data.order_code)
      .maybeSingle();
    if (error) throw new Error("Failed to load order");
    if (!order) return null;

    const { data: items, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select("id, product_name, unit_price, quantity, warranty_days")
      .eq("order_id", order.id);
    if (itemsError) throw new Error("Failed to load order items");

    return { ...order, items: items ?? [] };
  });
