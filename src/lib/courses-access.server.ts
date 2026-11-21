export async function getRole(supabase: any, userId: string): Promise<"admin" | "employee" | null> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`تعذّر قراءة صلاحية الحساب: ${error.message}`);
  const roles = (data ?? []).map((r: any) => r.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("employee")) return "employee";
  return null;
}

