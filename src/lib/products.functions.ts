import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const isStaff = (data ?? []).some((r: any) => r.role === "admin" || r.role === "employee");
  if (!isStaff) throw new Error("Forbidden: staff only");
}

const PRODUCT_WRITE_PATH_VERSION = "server-authorized-v2";
const PRODUCT_BUCKET = "product-images";
const PRODUCT_URL_TTL = 60 * 60 * 24 * 365 * 10;

function databaseOperationError(operation: string, error: { message: string; code?: string | null }) {
  const code = error.code ? ` (${error.code})` : "";
  return new Error(`[${operation}]${code} ${error.message}`);
}

function assertProductPath(path: string) {
  if (!/^products\/[\w.-]+$/.test(path)) throw new Error("Invalid product image path");
}

const productUploadSchema = z.object({
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive().max(25 * 1024 * 1024),
});

const pathSchema = z.object({ path: z.string().min(1).max(500) });

export const prepareProductImageUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => productUploadSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    if (!data.contentType.startsWith("image/")) throw new Error("نوع الملف غير مسموح");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Never include the original filename. Storage keys must remain ASCII-safe
    // regardless of the filename, language, punctuation, or extension supplied.
    const path = `products/${crypto.randomUUID()}`;
    const { data: upload, error } = await supabaseAdmin.storage
      .from(PRODUCT_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !upload?.token) throw new Error(error?.message ?? "فشل تجهيز رفع الصورة");
    return { path, token: upload.token };
  });

export const getProductImageUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => pathSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    assertProductPath(data.path);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(PRODUCT_BUCKET)
      .createSignedUrl(data.path, PRODUCT_URL_TTL);
    if (error || !signed?.signedUrl) throw new Error(error?.message ?? "فشل إنشاء رابط الصورة");
    return { url: signed.signedUrl };
  });

const productSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(300),
  slug: z.string().trim().min(1).max(300),
  description: z.string().max(50_000).nullable(),
  short_description: z.string().max(2_000).nullable(),
  category_id: z.string().uuid().nullable(),
  main_image: z.string().max(4_000).nullable(),
  gallery: z.array(z.string().max(4_000)).max(100),
  warranty_days: z.number().int().min(0).max(100_000),
  warranty_text: z.string().max(2_000).nullable(),
  refund_text: z.string().max(2_000).nullable(),
  base_price_egp: z.number().nonnegative(),
  discount_percent: z.number().min(0).max(100),
  discount_ends_at: z.string().datetime({ offset: true }).nullable(),
  featured: z.boolean(),
  active: z.boolean(),
  sort_order: z.number().int(),
  upsell_ids: z.array(z.string().uuid()).max(100),
});

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => productSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...row } = data;
    const operation = id ? "products.update" : "products.insert";
    console.info(`[product-save] ${PRODUCT_WRITE_PATH_VERSION} ${operation}`);
    const result = id
      ? await supabaseAdmin.from("products").update(row).eq("id", id)
      : await supabaseAdmin.from("products").insert(row);
    if (result.error) {
      console.error(`[product-save] ${operation} failed`, {
        code: result.error.code,
        message: result.error.message,
      });
      throw databaseOperationError(operation, result.error);
    }
    return { ok: true, operation, pathVersion: PRODUCT_WRITE_PATH_VERSION };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("products").delete().eq("id", data.id);
    if (error) throw databaseOperationError("products.delete", error);
    return { ok: true, operation: "products.delete" };
  });
