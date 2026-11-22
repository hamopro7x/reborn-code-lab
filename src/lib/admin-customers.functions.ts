import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
