import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (data ?? []).some((r: any) => r.role === "admin");
  if (!isAdmin) throw new Error("Forbidden: admin only");
}

const deviceSchema = z.enum(["desktop", "mobile"]);

const heroButtonSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  label: z.string(),
  url: z.string(),
  icon: z.string(),
  variant: z.enum(["primary", "teal", "outline"]),
});

const heroBadgeSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  title: z.string(),
  value: z.string(),
  icon: z.string(),
  color: z.string(),
});

const heroPositionSchema = z.object({ x: z.number(), y: z.number() });

const heroBannerSchema = z.object({
  id: z.string(),
  device: deviceSchema,
  title: z.string(),
  show_title: z.boolean(),
  subtitle: z.string(),
  show_subtitle: z.boolean(),
  subtitle2: z.string(),
  show_subtitle2: z.boolean(),
  media_type: z.enum(["image", "video", "color", "none"]),
  media_fit: z.enum(["cover", "contain"]),
  media_url: z.string().nullable(),
  media_path: z.string().nullable(),
  poster_url: z.string().nullable(),
  poster_path: z.string().nullable(),
  background_color: z.string().nullable(),
  video_autoplay: z.boolean(),
  video_muted: z.boolean(),
  video_loop: z.boolean(),
  overlay_enabled: z.boolean(),
  overlay_color: z.string(),
  overlay_opacity: z.number(),
  content_position_x: z.enum(["start", "center", "end"]),
  content_position_y: z.enum(["start", "center", "end"]),
  text_align: z.enum(["start", "center", "end"]),
  buttons_position: z.enum(["inline", "side"]),
  gap_title_subtitle: z.number(),
  gap_subtitle_buttons: z.number(),
  title_size: z.number(),
  title_size_mobile: z.number(),
  subtitle_size: z.number(),
  subtitle_size_mobile: z.number(),
  subtitle2_size: z.number(),
  subtitle2_size_mobile: z.number(),
  button_size: z.number(),
  buttons: z.array(heroButtonSchema),
  badges: z.array(heroBadgeSchema),
  positions: z.record(z.string(), heroPositionSchema),
  sort_order: z.number(),
  active: z.boolean(),
});

const listSchema = z.object({ device: deviceSchema.optional() });
export const listHeroBanners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => listSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.from("hero_banners").select("*").order("sort_order");
    if (error) throw new Error(error.message);
    const filtered = data.device ? (rows ?? []).filter((r: any) => r.device === data.device) : (rows ?? []);
    return filtered;
  });

const saveSchema = z.object({ banner: heroBannerSchema, isNew: z.boolean() });
export const saveHeroBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...row } = data.banner;
    const res = data.isNew
      ? await supabaseAdmin.from("hero_banners").insert(row as any)
      : await supabaseAdmin.from("hero_banners").update(row as any).eq("id", id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

const deleteSchema = z.object({ id: z.string().uuid() });
export const deleteHeroBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => deleteSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("hero_banners").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const toggleSchema = z.object({ id: z.string().uuid(), active: z.boolean() });
export const toggleHeroBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => toggleSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("hero_banners").update({ active: data.active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const orderSchema = z.object({ ids: z.array(z.string().uuid()) });
export const reorderHeroBanners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => orderSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const updates = data.ids.map((id, i) => supabaseAdmin.from("hero_banners").update({ sort_order: i }).eq("id", id));
    const results = await Promise.all(updates);
    const err = results.find((r) => r.error)?.error;
    if (err) throw new Error(err.message);
    return { ok: true };
  });

const duplicateSchema = z.object({ banner: heroBannerSchema });
export const duplicateHeroBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => duplicateSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...row } = data.banner;
    const { error } = await supabaseAdmin.from("hero_banners").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const importSchema = z.object({ rows: z.array(heroBannerSchema.omit({ id: true })) });
export const importHeroBanners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => importSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("hero_banners").insert(data.rows);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
