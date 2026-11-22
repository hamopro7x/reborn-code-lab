



export type Role = "admin" | "employee";

/** Role is re-read from user_roles on every call; UI hiding is never trusted. */
export async function roleOf(supabase: any, userId: string): Promise<Role> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("employee")) return "employee";
  throw new Error("Forbidden");
}
export async function adminDb(): Promise<any> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
export async function requireAdmin(ctx: any) {
  if ((await roleOf(ctx.supabase, ctx.userId)) !== "admin") throw new Error("هذا الإجراء للأدمن فقط");
}
export async function log(db: any, row: any) {
  const { logActivity } = await import("@/lib/mail/sync.server");
  await logActivity(db, row);
}
