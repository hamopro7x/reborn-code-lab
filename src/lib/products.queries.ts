import { supabase } from "@/integrations/supabase/client";

/** Admin catalog list with the category fields used by product cards. */
export async function listAdminProducts() {
  const { data } = await supabase
    .from("products")
    .select("*, category:categories(name,icon)")
    .order("sort_order");
  return data ?? [];
}

/** Active products for the public shop grid. */
export async function listActiveProducts() {
  const { data } = await supabase
    .from("products")
    .select("*, category:categories(id,slug,name,icon)")
    .eq("active", true)
    .order("sort_order");
  return data ?? [];
}

/** Latest active products used by the home-page rail and initial loader. */
export async function listLatestActiveProducts(limit = 10) {
  const { data } = await supabase
    .from("products")
    .select("*, category:categories(icon,name)")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** One active product and its category by public slug. */
export async function getActiveProductBySlug(slug: string) {
  const { data } = await supabase
    .from("products")
    .select("*, category:categories(id,slug,name,icon)")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  return data;
}

/** Approved reviews shown on the public product page. */
export async function listApprovedProductReviews(productId: string) {
  const { data } = await supabase
    .from("reviews")
    .select("*")
    .eq("product_id", productId)
    .eq("approved", true)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Active upsell products selected by the current product. */
export async function listActiveUpsellProducts(ids: string[]) {
  if (!ids.length) return [];
  const { data } = await supabase
    .from("products")
    .select("*, category:categories(icon,name)")
    .in("id", ids)
    .eq("active", true);
  return data ?? [];
}

/** Active products in one category, preserving the category relation filter. */
export async function listActiveProductsByCategorySlug(slug: string) {
  const { data } = await supabase
    .from("products")
    .select("*, category:categories!inner(id,slug,name,icon)")
    .eq("active", true)
    .eq("categories.slug", slug)
    .order("sort_order");
  return data ?? [];
}

/** Uploads a product image with a server-issued Storage upload token. */
export async function uploadProductImage(path: string, token: string, file: File, contentType: string) {
  return supabase.storage
    .from("product-images")
    .uploadToSignedUrl(path, token, file, { contentType });
}
