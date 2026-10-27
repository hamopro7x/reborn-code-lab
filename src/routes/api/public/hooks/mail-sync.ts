import { createFileRoute } from "@tanstack/react-router";

// Scheduler-only Gmail sync. Requires MAIL_SYNC_SECRET (or SYNC_HOOK_SECRET) in `x-sync-secret`.
export const Route = createFileRoute("/api/public/hooks/mail-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["MAIL_SYNC_SECRET"] || process.env["SYNC_HOOK_SECRET"] || "";
        const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
        if (!secret) return json({ error: "mail_sync_not_configured" }, 503);
        const { timingSafeEqual } = await import("@/lib/mail/crypto.server");
        if (!timingSafeEqual(request.headers.get("x-sync-secret") ?? "", secret)) return json({ error: "unauthorized" }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncAllMail } = await import("@/lib/mail/sync.server");
        try {
          const results = await syncAllMail(supabaseAdmin);
          return json({ ok: true, results });
        } catch (e: any) {
          return json({ ok: false, error: String(e?.message ?? e).slice(0, 200) }, 500);
        }
      },
    },
  },
});
