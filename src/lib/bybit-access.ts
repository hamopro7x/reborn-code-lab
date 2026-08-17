/**
 * Shared access rules + input validation for "معاملات الفيزا".
 * Every server function reuses these, so a new account/API can never bypass
 * or re-implement the checks.
 */
export type BybitRole = "admin" | "employee";

export async function assertAccess(supabase: any, userId: string): Promise<BybitRole> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("employee")) return "employee";
  throw new Error("Forbidden");
}

export async function assertAdmin(supabase: any, userId: string): Promise<"admin"> {
  const role = await assertAccess(supabase, userId);
  if (role !== "admin") throw new Error("Forbidden");
  return "admin";
}

/** Standard shape for any endpoint scoped to one Bybit account. */
export const accountInput = (input: any) => ({
  accountId: input?.accountId ? String(input.accountId) : undefined,
});

export const requiredId = (input: any, label: string) => {
  const id = String(input?.id ?? "").trim();
  if (!id) throw new Error(label);
  return id;
};

/** Same validation for every place an API key/secret enters the system. */
export function validateApiCreds(input: any) {
  const apiKey = String(input?.apiKey ?? "").trim();
  const apiSecret = String(input?.apiSecret ?? "").trim();
  const name = String(input?.name ?? "").trim().slice(0, 60);
  if (apiKey.length < 8 || apiKey.length > 200) throw new Error("مفتاح API غير صالح");
  if (apiSecret.length < 8 || apiSecret.length > 400) throw new Error("السر غير صالح");
  return { apiKey, apiSecret, name };
}
