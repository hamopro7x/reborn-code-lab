import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Resolve the current user's admin/employee role for the authenticated workspace. */
export function useAdminRole() {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      if (!data.user) {
        setRole("customer");
        return;
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      if (!active) return;
      if (roles?.some((row: any) => row.role === "admin")) setRole("admin");
      else if (roles?.some((row: any) => row.role === "employee")) setRole("employee");
      else setRole("customer");
    }).catch(() => {
      if (active) setRole("customer");
    });
    return () => { active = false; };
  }, []);
  return role;
}
