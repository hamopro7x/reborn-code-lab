import { supabase } from "@/integrations/supabase/client";

/** Admin category list, including inactive categories. */
export async function listAdminCategories() {
  const { data } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order");
  return data ?? [];
}

/** Active categories shown on the public storefront. */
export async function listActiveCategories() {
  const { data } = await supabase
    .from("categories")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  return data ?? [];
}

/** One category by public slug. */
export async function getCategoryBySlug(slug: string) {
  const { data } = await supabase
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

/** Uploads a category banner with a server-issued Storage upload token. */
export async function uploadCategoryImage(path: string, token: string, file: File, contentType: string) {
  return supabase.storage
    .from("product-images")
    .uploadToSignedUrl(path, token, file, { contentType });
}
