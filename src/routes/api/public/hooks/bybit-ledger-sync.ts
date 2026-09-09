import { createFileRoute } from "@tanstack/react-router";

/**
 * Background ledger sync. Called by the scheduler every minute and by the admin
 * panel while it is open, so new transactions land in the central ledger with no
 * manual action. Bybit exposes no webhook for card activity, so this is the
 * fastest safe polling hop.
 *
 * Safety rules baked in:
 * - single-flight lease in `bybit_sync_state` so concurrent hops exit early
 * - bounded work per run (one recent page per account + one backfill chunk)
 * - idempotent writes (both tables upsert on the provider's own id)
 * - reads are the source of truth; the central ledger is never re-graded
 */
export const Route = createFileRoute("/api/public/hooks/bybit-ledger-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Scheduler-only endpoint: requires a private shared secret in
        // `x-sync-secret`. There is no publishable/anon-key fallback, since that
        // key ships in the browser bundle and would authenticate anyone.
        const hookSecret = process.env["SYNC_HOOK_SECRET"] ?? "";
        if (!hookSecret) {
          return json({ error: "sync_hook_not_configured" }, 503);
        }
        if (request.headers.get("x-sync-secret") !== hookSecret) {
          return json({ error: "unauthorized" }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();
        const lease = new Date(now.getTime() + 4 * 60_000).toISOString();

        const { data: locked, error: lockError } = await supabaseAdmin
          .from("bybit_sync_state")
          .update({ lease_until: lease })
          .eq("id", "ledger")
          .eq("paused", false)
          .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
          .select("id")
          .maybeSingle();

        // A failing lease write means bad/missing service credentials, not a
        // concurrent run. Reporting it separately makes self-hosted setups
        // debuggable instead of looping on "busy_or_paused" forever.
        if (lockError) {
          return json({ skipped: true, reason: "lock_failed", error: lockError.message }, 500);
        }
        if (!locked) return json({ skipped: true, reason: "busy_or_paused" });

        const mod = await import("@/lib/bybit.server");
        let result: Record<string, unknown> = {};
        try {
          const ingest = await mod.syncAllCardTxns();
          const mirrored = await mod.syncAllLedger();
          result = { added: ingest.added, saved: mirrored.saved, accounts: mirrored.accounts };
        } catch (e) {
          result = { error: e instanceof Error ? e.message : "sync failed" };
        }

        // Monthly-cycle cleanup runs even when the sync above failed, so old
        // cycles are always removed from the database. Work-sheet data is never
        // touched (see monthly-cycle.server.ts).
        const { runCyclePurgeSafe } = await import("@/lib/monthly-cycle.server");
        await runCyclePurgeSafe();


        await supabaseAdmin
          .from("bybit_sync_state")
          .update({ lease_until: null, last_run_at: new Date().toISOString(), last_result: result as never })
          .eq("id", "ledger");

        return json({ ok: !("error" in result), ...result });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
