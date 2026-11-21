import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./admin-access.server";

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const staff = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "employee");
    if (!staff) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { customerSummary } = await import("./customer-summary.server");
    return customerSummary(supabaseAdmin);
  });

export const deleteAllOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ids, error: selErr } = await supabaseAdmin.from("orders").select("id");
    if (selErr) throw new Error(selErr.message);
    const orderIds = (ids ?? []).map((r: any) => r.id);
    if (!orderIds.length) return { deleted: 0 };
    const { error: itemsErr } = await supabaseAdmin.from("order_items").delete().in("order_id", orderIds);
    if (itemsErr) throw new Error(itemsErr.message);
    const { error: ordersErr } = await supabaseAdmin.from("orders").delete().in("id", orderIds);
    if (ordersErr) throw new Error(ordersErr.message);
    return { deleted: orderIds.length };
  });
