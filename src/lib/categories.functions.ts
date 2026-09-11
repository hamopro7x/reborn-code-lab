import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (data ?? []).some((r: any) => r.role === "admin");
  if (!isAdmin) throw new Error("Forbidden: admin only");
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
  .inputValidator((data) => prepareSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (!data.contentType.startsWith("image/")) throw new Error("نوع الملف غير مسموح");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `products/${crypto.randomUUID()}.${safeExtension(data.fileName, data.contentType)}`;
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
