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
        const key = request.headers.get("apikey") ?? "";
        const expected = process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
        if (!expected || key !== expected) {
          return json({ error: "unauthorized" }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();
        const lease = new Date(now.getTime() + 4 * 60_000).toISOString();

        const { data: locked } = await supabaseAdmin
          .from("bybit_sync_state")
          .update({ lease_until: lease })
          .eq("id", "ledger")
          .eq("paused", false)
          .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
          .select("id")
          .maybeSingle();

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
