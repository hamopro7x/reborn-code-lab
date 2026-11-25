import { supabase } from "@/integrations/supabase/client";

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
