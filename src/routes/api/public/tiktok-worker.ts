import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }),
  z.object({
    action: z.literal("update"),
    id: z.string().uuid(),
    status: z.enum(["starting", "qr_ready", "scanned", "charging", "done", "manual"]),
    qr_image: z.string().max(400_000).optional(),
    error: z.string().max(1000).optional(),
  }),
]);

// Called only by the MG Pro charging worker on the VPS (token from admin panel).
export const Route = createFileRoute("/api/public/tiktok-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { readSettings, enqueueConfirmedOrders, spentToday, admin } = await import("@/lib/tiktok-jobs.server");
        const s = await readSettings();
        const token = request.headers.get("x-worker-token")?.trim() ?? "";
        if (!s.token || s.token.length < 24 || token !== s.token) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        let input: z.infer<typeof body>;
        try { input = body.parse(await request.json()); } catch { return Response.json({ error: "invalid" }, { status: 400 }); }
        const db = await admin();
        const now = new Date().toISOString();

        if (input.action === "claim") {
          if (!s.enabled) return Response.json({ job: null, reason: "disabled" });
          await enqueueConfirmedOrders();
          // Stale in-progress jobs (worker crashed) go to staff, never re-charged automatically.
          await db.from("tiktok_jobs").update({ status: "manual", error: "انقطع العامل أثناء التنفيذ", updated_at: now })
            .in("status", ["starting", "qr_ready", "scanned", "charging"]).lt("updated_at", new Date(Date.now() - 15 * 60_000).toISOString());
          const { data: job } = await db.from("tiktok_jobs").select("id, coins, amount_egp, order_id").eq("status", "queued").order("created_at").limit(1).maybeSingle();
          if (!job) return Response.json({ job: null });
          if (s.daily_limit_egp > 0 && (await spentToday()) + Number(job.amount_egp) > s.daily_limit_egp) {
            await db.from("tiktok_jobs").update({ status: "manual", error: "تخطى الحد اليومي", updated_at: now }).eq("id", job.id);
            return Response.json({ job: null, reason: "limit" });
          }
          const { data: claimed } = await db.from("tiktok_jobs")
            .update({ status: "starting", claimed_at: now, updated_at: now, attempts: 1 })
            .eq("id", job.id).eq("status", "queued").select("id").maybeSingle();
          if (!claimed) return Response.json({ job: null });
          return Response.json({ job: { id: job.id, coins: job.coins } });
        }

        const patch: Record<string, unknown> = { status: input.status, updated_at: now };
        if (input.qr_image !== undefined) patch.qr_image = input.qr_image;
        if (input.error !== undefined) patch.error = input.error;
        if (input.status === "done" || input.status === "manual") { patch.finished_at = now; patch.qr_image = null; }
        await db.from("tiktok_jobs").update(patch).eq("id", input.id).not("status", "in", "(done,manual)");
        if (input.status === "done") {
          const { data: j } = await db.from("tiktok_jobs").select("order_id").eq("id", input.id).maybeSingle();
          if (j) await db.from("orders").update({ status: "completed", updated_at: now }).eq("id", j.order_id);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
