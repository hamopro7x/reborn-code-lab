export async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error("Unable to verify administrator permissions");
  const isAdmin = (data ?? []).some((r: any) => r.role === "admin");
  if (!isAdmin) throw new Error("Forbidden: admin only");
}
