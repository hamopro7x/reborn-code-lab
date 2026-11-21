import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRole } from "./courses-access.server";

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
      .from("course_lessons").select("video_path,course_id").eq("id", data.lesson_id).maybeSingle();
    if (!lesson?.video_path) throw new Error("Lesson not found");
    if (role !== "admin") {
      const { data: access } = await supabaseAdmin
        .from("course_access").select("id")
        .eq("course_id", lesson.course_id).eq("user_id", context.userId)
        .limit(1).maybeSingle();
      if (!access) throw new Error("Forbidden");
    }

    const { data: signed, error } = await supabaseAdmin
      .storage.from("course-videos")
      .createSignedUrl(lesson.video_path, 60 * 10); // 10 minutes, re-checked on each request
    if (error || !signed?.signedUrl) throw new Error(error?.message || "Failed to sign URL");

    // touch last seen
    if (devId) {
      await supabaseAdmin.from("user_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", devId);
    }

    return { url: signed.signedUrl };
  });

/** Admin: list all devices, or devices for a specific user. */
