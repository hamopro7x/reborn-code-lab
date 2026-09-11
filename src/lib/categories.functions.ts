import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (data ?? []).some((r: any) => r.role === "admin");
  if (!isAdmin) throw new Error("Forbidden: admin only");
}

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const isStaff = (data ?? []).some((r: any) => r.role === "admin" || r.role === "employee");
  if (!isStaff) throw new Error("Forbidden: staff only");
}

const CATEGORY_BUCKET = "product-images";
const CATEGORY_URL_TTL = 60 * 60 * 24 * 365 * 10;

function safeExtension(fileName: string, contentType: string) {
  const fromName = /\.([A-Za-z0-9]{1,8})$/.exec(fileName)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const fromType = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return fromType && fromType.length <= 8 ? fromType : "bin";
}

function assertCategoryPath(path: string) {
  if (!/^categories\/[\w.\-]+$/.test(path)) throw new Error("Invalid category image path");
}

function assertProductPath(path: string) {
  if (!/^products\/[\w.\-]+$/.test(path)) throw new Error("Invalid product image path");
}

const prepareSchema = z.object({
  fileName: z.string().min(1).max(300),
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive().max(25 * 1024 * 1024),
});

const productUploadSchema = z.object({
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive().max(25 * 1024 * 1024),
});

export const prepareCategoryImageUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => prepareSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (!data.contentType.startsWith("image/")) throw new Error("نوع الملف غير مسموح");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `categories/${crypto.randomUUID()}.${safeExtension(data.fileName, data.contentType)}`;
    const { data: upload, error } = await supabaseAdmin.storage
      .from(CATEGORY_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !upload?.token) throw new Error(error?.message ?? "فشل تجهيز رفع الصورة");
    return { path, token: upload.token };
  });

const pathSchema = z.object({ path: z.string().min(1).max(500) });

export const getCategoryImageUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => pathSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    assertCategoryPath(data.path);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(CATEGORY_BUCKET)
      .createSignedUrl(data.path, CATEGORY_URL_TTL);
    if (error || !signed?.signedUrl) throw new Error(error?.message ?? "فشل إنشاء رابط الصورة");
    return { url: signed.signedUrl };
  });

export const prepareProductImageUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => productUploadSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (!data.contentType.startsWith("image/")) throw new Error("نوع الملف غير مسموح");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Never include the original filename. Storage keys must remain ASCII-safe
    // regardless of the filename, language, punctuation, or extension supplied.
    const path = `products/${crypto.randomUUID()}`;
    const { data: upload, error } = await supabaseAdmin.storage
      .from(CATEGORY_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !upload?.token) throw new Error(error?.message ?? "فشل تجهيز رفع الصورة");
    return { path, token: upload.token };
  });

export const getProductImageUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => pathSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    assertProductPath(data.path);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(CATEGORY_BUCKET)
      .createSignedUrl(data.path, CATEGORY_URL_TTL);
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
    const result = id
      ? await supabaseAdmin.from("products").update(row).eq("id", id)
      : await supabaseAdmin.from("products").insert(row);
    if (result.error) throw new Error(result.error.message);
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const saveSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  icon: z.string().max(20).nullable(),
  banner_image: z.string().max(2000).nullable(),
  sort_order: z.number().int(),
  active: z.boolean(),
});

export const saveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...row } = data;
    const res = id
      ? await supabaseAdmin.from("categories").update(row as any).eq("id", id)
      : await supabaseAdmin.from("categories").insert(row as any);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

const deleteSchema = z.object({ id: z.string().uuid() });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => deleteSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
