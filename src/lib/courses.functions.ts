import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getRole(supabase: any, userId: string): Promise<"admin" | "employee" | null> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("employee")) return "employee";
  return null;
}

const checkSchema = z.object({
  fingerprint: z.string().trim().min(6).max(200),
  user_agent: z.string().trim().max(500).optional(),
  hw_signature: z.string().trim().max(200).optional(),
  legacy_fingerprint: z.string().trim().max(200).optional(),
});

/** Check if this device is authorized for the current user. Admin must pre-authorize devices. */
export const checkDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => checkSchema.parse(d))
  .handler(async ({ data, context }) => {
    const role = await getRole(context.supabase, context.userId);
    if (!role) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Admins always pass — no device restriction on management accounts.
    if (role === "admin") {
      return { ok: true as const };
    }

    const now = new Date().toISOString();

    // Authorization = USER + DEVICE. Never global, never inherited.
    // نبحث فقط داخل أجهزة هذا المستخدم؛ hw_signature مجرد معرّف مساعد.
    const fps = [data.fingerprint, data.legacy_fingerprint].filter(Boolean) as string[];

    const { data: mine } = await supabaseAdmin
      .from("user_devices")
      .select("id,user_id,device_label,device_fingerprint,hw_signature")
      .eq("user_id", context.userId)
      .in("device_fingerprint", fps)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let approved: any = mine ?? null;

    if (!approved && data.hw_signature) {
      // نفس المستخدم + نفس الجهاز الفعلي (بروفايل متصفح مختلف مثلاً)
      const { data: bySig } = await supabaseAdmin
        .from("user_devices")
        .select("id,user_id,device_label,device_fingerprint,hw_signature")
        .eq("user_id", context.userId)
        .eq("hw_signature", data.hw_signature)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      approved = bySig ?? null;
    }

    if (approved) {
      if (approved.device_fingerprint === data.fingerprint) {
        await supabaseAdmin
          .from("user_devices")
          .update({ last_seen_at: now, user_agent: data.user_agent ?? null, hw_signature: data.hw_signature ?? approved.hw_signature })
          .eq("id", approved.id);
      } else {
        // نفس المستخدم ونفس الجهاز، لكن بصمة أحدث → نثبّتها تحت نفس المستخدم فقط.
        await supabaseAdmin.from("user_devices").upsert({
          user_id: context.userId,
          device_fingerprint: data.fingerprint,
          device_label: approved.device_label ?? null,
          user_agent: data.user_agent ?? null,
          hw_signature: data.hw_signature ?? approved.hw_signature ?? null,
          last_seen_at: now,
        }, { onConflict: "user_id,device_fingerprint" });
      }
      return { ok: true as const };
    }
    return { ok: false as const, blocked: true, fingerprint: data.fingerprint };

  });



/** Admin: manually authorize a device fingerprint for a specific user. */
export const adminAddDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    user_id: z.string().uuid(),
    fingerprint: z.string().trim().min(6).max(200),
    label: z.string().trim().max(120).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await getRole(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_devices").upsert({
      user_id: data.user_id,
      device_fingerprint: data.fingerprint,
      device_label: data.label ?? null,
    }, { onConflict: "user_id,device_fingerprint" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: list all employees (for the add-device selector). */
export const adminListEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getRole(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id,role").in("role", ["employee", "admin"]);
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (!ids.length) return [];
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id,email,full_name").in("id", ids);
    return profiles ?? [];
  });

/** Admin: list users allowed to view a specific course. */
export const adminListCourseAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ course_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await getRole(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("course_access").select("id,user_id,created_at").eq("course_id", data.course_id);
    const ids = (rows ?? []).map((r: any) => r.user_id);
    if (!ids.length) return [];
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id,email,full_name").in("id", ids);
    const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return (rows ?? []).map((r: any) => ({ ...r, ...map.get(r.user_id) }));
  });

/** Admin: grant access to a course for a user. */
export const adminGrantCourseAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ course_id: z.string().uuid(), user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await getRole(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("course_access").upsert({
      course_id: data.course_id, user_id: data.user_id, granted_by: context.userId,
    }, { onConflict: "course_id,user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: revoke access. */
export const adminRevokeCourseAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ access_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await getRole(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("course_access").delete().eq("id", data.access_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Returns a short-lived signed URL for the lesson video, only if user is staff and device is trusted. */
export const getLessonVideoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ lesson_id: z.string().uuid(), fingerprint: z.string().min(6).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await getRole(context.supabase, context.userId);
    if (!role) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // الجهاز يجب أن يكون مصرّحًا لهذا المستخدم تحديدًا (الأدمن مستثنى من قيد الأجهزة).
    let devId: string | null = null;
    if (role !== "admin") {
      const { data: dev } = await supabaseAdmin
        .from("user_devices")
        .select("id")
        .eq("user_id", context.userId)
        .eq("device_fingerprint", data.fingerprint)
        .limit(1)
        .maybeSingle();
      if (!dev) throw new Error("DEVICE_NOT_TRUSTED");
      devId = dev.id;
    }



    const { data: lesson } = await supabaseAdmin
      .from("course_lessons").select("video_path").eq("id", data.lesson_id).maybeSingle();
    if (!lesson?.video_path) throw new Error("Lesson not found");

    const { data: signed, error } = await supabaseAdmin
      .storage.from("course-videos")
      .createSignedUrl(lesson.video_path, 60 * 60 * 2); // 2 hours
    if (error || !signed?.signedUrl) throw new Error(error?.message || "Failed to sign URL");

    // touch last seen
    await supabaseAdmin.from("user_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", dev.id);
    return { url: signed.signedUrl };
  });

/** Admin: list all devices, or devices for a specific user. */
export const adminListDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getRole(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: devices } = await supabaseAdmin
      .from("user_devices")
      .select("id,user_id,device_fingerprint,device_label,user_agent,first_seen_at,last_seen_at")
      .order("last_seen_at", { ascending: false });
    const ids = Array.from(new Set((devices ?? []).map((d: any) => d.user_id)));
    if (!ids.length) return [];
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id,email,full_name").in("id", ids);
    const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return (devices ?? []).map((d: any) => ({
      ...d,
      email: map.get(d.user_id)?.email ?? "",
      full_name: map.get(d.user_id)?.full_name ?? "",
    }));
  });

export const adminDeleteDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ device_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await getRole(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_devices").delete().eq("id", data.device_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminResetUserDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await getRole(context.supabase, context.userId);
    if (role !== "admin") throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_devices").delete().eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Get current viewer info (name + email + avatar) for profile header. */
export const getViewerIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("profiles").select("email,full_name,avatar_url").eq("id", context.userId).maybeSingle();
    let avatarUrl = "";
    if (data?.avatar_url) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed } = await supabaseAdmin.storage
        .from("avatars")
        .createSignedUrl(data.avatar_url, 60 * 60 * 24);
      avatarUrl = signed?.signedUrl ?? "";
    }
    return { email: data?.email ?? "", full_name: data?.full_name ?? "", avatar_url: avatarUrl, user_id: context.userId };
  });