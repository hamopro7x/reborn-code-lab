import { supabase } from "@/integrations/supabase/client";

/** Read the admin order list with the same status/search behavior as the panel. */
export async function listAdminOrders(filter: string, search: string) {
  let query = supabase
    .from("orders")
    .select("*, items:order_items(*), payment_method:payment_methods(name)")
    .order("created_at", { ascending: false });
  if (!search.trim() && filter !== "all") query = query.eq("status", filter as any);
  const { data } = await query;
  return data ?? [];
}

/** Update an order's status; confirmation time is recorded only on confirmation. */
export async function updateAdminOrderStatus(id: string, status: string) {
  const patch: any = { status };
  if (status === "confirmed") patch.confirmed_at = new Date().toISOString();
  const { error } = await supabase.from("orders").update(patch).eq("id", id);
  return { error };
}

/** Resolve the private payment proof to a short-lived URL for the admin panel. */
export async function getOrderScreenshotUrl(rawPath: string): Promise<string> {
  const path = rawPath.includes("payment-screenshots/")
    ? rawPath.split("payment-screenshots/")[1]
    : rawPath;
  const { data, error } = await supabase.storage
    .from("payment-screenshots")
    .createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error("تعذر فتح الإثبات");
  return data.signedUrl;
}
