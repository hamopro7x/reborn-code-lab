import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    const isEmployee = (roles ?? []).some((r: any) => r.role === "employee");
    if (!isAdmin && !isEmployee) throw new Error("Forbidden");

    // The UI share toggle is not an authorization boundary. Enforce the same
    // explicit customer-panel share before using the service-role client.
    if (!isAdmin) {
      const { data: setting, error: settingError } = await context.supabase
        .from("site_settings")
        .select("value")
        .eq("key", "employee_panels")
        .maybeSingle();
      if (settingError) throw new Error("Forbidden");
      const panels = (setting?.value as { panels?: unknown } | null)?.panels;
      if (!Array.isArray(panels) || !panels.includes("customers")) {
        throw new Error("Forbidden");
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { customerSummary } = await import("./customer-summary.server");
    return customerSummary(supabaseAdmin);
  });
