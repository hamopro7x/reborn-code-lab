import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error || !(data ?? []).some((r: any) => r.role === "admin")) throw new Error("غير مصرح");
}

/** Public: charging status + QR for one order (order code acts as the secret, like the order page). */
export const getTikTokJob = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ order_code: z.string().trim().min(4).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { admin } = await import("@/lib/tiktok-jobs.server");
    const db = await admin();
    const { data: order } = await db.from("orders").select("id").eq("order_code", data.order_code).maybeSingle();
    if (!order) return null;
    const { data: job } = await db.from("tiktok_jobs").select("status, coins, qr_image, updated_at").eq("order_id", order.id).maybeSingle();
    if (!job) return null;
    return { status: job.status as string, coins: job.coins as number, qr_image: (job.status === "qr_ready" ? job.qr_image : null) as string | null };
  });

export const getTikTokAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { readSettings, spentToday, admin } = await import("@/lib/tiktok-jobs.server");
    const s = await readSettings();
    const db = await admin();
    const { data: jobs } = await db.from("tiktok_jobs")
      .select("id, coins, amount_egp, status, error, created_at, updated_at, order:orders(order_code, customer_name)")
      .order("created_at", { ascending: false }).limit(50);
    return {
      enabled: s.enabled, daily_limit_egp: s.daily_limit_egp, has_token: !!s.token,
      spent_today: await spentToday(),
      jobs: (jobs ?? []).map((j: any) => ({ ...j, order_code: j.order?.order_code ?? "", customer: j.order?.customer_name ?? "" })),
    };
  });

export const saveTikTokAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ enabled: z.boolean(), daily_limit_egp: z.number().min(0).max(10_000_000), new_token: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { readSettings, writeSettings } = await import("@/lib/tiktok-jobs.server");
    const s = await readSettings();
    let token = s.token;
    if (data.new_token || !token) {
      const b = new Uint8Array(32); crypto.getRandomValues(b);
      token = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    }
    await writeSettings({ enabled: data.enabled, daily_limit_egp: data.daily_limit_egp, token });
    return { token: data.new_token || !s.token ? token : null };
  });

export const setTikTokJobStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), status: z.enum(["manual", "done", "queued"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { admin } = await import("@/lib/tiktok-jobs.server");
    const db = await admin();
    const now = new Date().toISOString();
    await db.from("tiktok_jobs").update({ status: data.status, qr_image: null, updated_at: now, finished_at: data.status === "queued" ? null : now, error: data.status === "queued" ? null : undefined }).eq("id", data.id);
    if (data.status === "done") {
      const { data: j } = await db.from("tiktok_jobs").select("order_id").eq("id", data.id).maybeSingle();
      if (j) await db.from("orders").update({ status: "completed", updated_at: now }).eq("id", j.order_id);
    }
    return { ok: true };
  });
