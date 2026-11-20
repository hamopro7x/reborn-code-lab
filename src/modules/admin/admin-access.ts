import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Stable route keys for the administration workspace. */
export type PanelKey =
  | "overview" | "orders" | "categories" | "products" | "customers" | "employees"
  | "reviews" | "payments" | "currencies" | "timers" | "settings" | "courses" | "devices"
  | "reports" | "remote" | "cardtx" | "apikey" | "worksheet" | "sheet" | "mail" | "chat";

/** Single source of truth for valid admin panel URL values. */
export const panelKeys: readonly PanelKey[] = [
  "overview", "orders", "categories", "customers", "employees",
  "reviews", "payments", "currencies", "timers", "settings", "courses", "devices",
  "reports", "remote", "cardtx", "apikey", "worksheet", "sheet", "mail", "chat",
];

/**
 * Resolves the signed-in user's application role for admin UI gating.
 * This remains a presentation guard; server functions must enforce authorization too.
 */
export function useAdminRole() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active || !data.user) return;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);

      if (!active) return;
      if (roles?.some((r: { role: string }) => r.role === "admin")) setRole("admin");
      else if (roles?.some((r: { role: string }) => r.role === "employee")) setRole("employee");
      else setRole("customer");
    })();

    return () => {
      active = false;
    };
  }, []);

  return role;
}
