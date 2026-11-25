import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./admin-access.server";
import { z } from "zod";
import { assertAccess } from "./bybit-access";

const updateOrderStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["confirmed", "completed", "cancelled", "rejected"]),
});

export const updateAdminOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateOrderStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const role = await assertAccess(context.supabase, context.userId);
    if (role !== "admin") {
      const { data: setting, error } = await context.supabase
        .from("site_settings")
        .select("value")
        .eq("key", "employee_panels")
        .maybeSingle();
      if (error) throw new Error("Forbidden");
      const panels = (setting?.value as { panels?: unknown } | null)?.panels;
      if (!Array.isArray(panels) || !panels.includes("orders")) {
        throw new Error("Forbidden");
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { status: string; confirmed_at?: string } = { status: data.status };
    if (data.status === "confirmed") patch.confirmed_at = new Date().toISOString();
    const { data: updated, error } = await supabaseAdmin
      .from("orders")
      .update(patch)
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("تعذر تحديث حالة الطلب.");
    if (!updated) throw new Error("الطلب غير موجود أو لا يمكن تحديث حالته.");
    return { ok: true };
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
