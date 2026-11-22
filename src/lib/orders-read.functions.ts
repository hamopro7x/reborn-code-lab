import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const getSchema = z.object({ order_code: z.string().min(4).max(40) });

export const getOrderByCode = createServerFn({ method: "GET" })
  .inputValidator((data) => getSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_code, status, customer_name, customer_email, customer_phone, dial_code, currency_code, subtotal, total, created_at, payment_method:payment_methods(name,account_number)"
      )
      .eq("order_code", data.order_code)
      .maybeSingle();
    if (error) throw new Error("Failed to load order");
    if (!order) return null;

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("id, product_name, unit_price, quantity, warranty_days")
      .eq("order_id", order.id);

    return { ...order, items: items ?? [] };
  });

const deviceOrdersSchema = z.object({
  device_id: z.string().trim().min(16).max(128),
});

export const listOrdersByDevice = createServerFn({ method: "POST" })
  .inputValidator((data) => deviceOrdersSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: orders, error } = await supabaseAdmin
      .from("orders")
      .select("id, order_code, status, total, currency_code, created_at")
      .eq("device_id", data.device_id)
      .is("user_id", null)
      .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Failed to load orders");
    return orders ?? [];
  });
