import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./admin-access.server";
import { z } from "zod";
import { assertAccess } from "./bybit-access";

const updateOrderStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["confirmed", "completed", "cancelled", "rejected"]),
});


type OrderStatus = "pending_payment" | "awaiting_confirmation" | "confirmed" | "rejected" | "completed" | "cancelled";

const listOrdersSchema = z.object({
  filter: z.string().max(40),
  search: z.string().max(200),
});

export const listAdminOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listOrdersSchema.parse(input))
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
      if (!Array.isArray(panels) || !panels.includes("orders")) throw new Error("Forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("orders")
      .select("*, items:order_items(*), payment_method:payment_methods(name)")
      .order("created_at", { ascending: false });
    if (!data.search.trim() && data.filter !== "all") query = query.eq("status", data.filter as OrderStatus);
    const { data: rows, error } = await query;
    if (error) throw new Error("تعذر تحميل الطلبات. حاول مرة أخرى.");
    return rows ?? [];
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
    const { data: current, error: readError } = await supabaseAdmin
      .from("orders")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError || !current) throw new Error("الطلب غير موجود.");

    const allowed: Partial<Record<OrderStatus, OrderStatus[]>> = {
      pending_payment: ["confirmed", "completed", "cancelled"],
      awaiting_confirmation: ["confirmed", "completed", "cancelled", "rejected"],
      confirmed: ["completed", "cancelled"],
    };
    if (!allowed[current.status]?.includes(data.status)) {
      throw new Error("انتقال حالة الطلب غير مسموح.");
    }

    const patch: { status: OrderStatus; confirmed_at?: string } = { status: data.status };
    if (data.status === "confirmed") patch.confirmed_at = new Date().toISOString();
    const { data: updated, error } = await supabaseAdmin
      .from("orders")
      .update(patch)
      .eq("id", data.id)
      .eq("status", current.status)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("تعذر تحديث حالة الطلب.");
    if (!updated) throw new Error("تم تغيير الطلب بواسطة مستخدم آخر. حدّث القائمة وحاول مجددًا.");
    return { ok: true };
  });



const screenshotPathSchema = z.object({ path: z.string().min(1).max(500) });

export const getOrderScreenshotUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => screenshotPathSchema.parse(input))
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
      if (!Array.isArray(panels) || !panels.includes("orders")) throw new Error("Forbidden");
    }

    const path = data.path.includes("payment-screenshots/")
      ? data.path.split("payment-screenshots/")[1]
      : data.path;
    if (!path || path.includes("..")) throw new Error("Invalid payment proof path");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("payment_screenshot", path)
      .maybeSingle();
    if (orderError || !order) throw new Error("Payment proof not found");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("payment-screenshots")
      .createSignedUrl(path, 300);
    if (error || !signed?.signedUrl) throw new Error("تعذر فتح إثبات الدفع");
    return signed.signedUrl;
  });

export const deleteAllOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // order_items.order_id has ON DELETE CASCADE, so one DELETE statement
    // removes parent orders and their items atomically (no partial cleanup).
    const { data: deletedRows, error } = await supabaseAdmin
      .from("orders")
      .delete()
      .select("id");
    if (error) throw new Error(error.message);
    return { deleted: deletedRows?.length ?? 0 };
  });
