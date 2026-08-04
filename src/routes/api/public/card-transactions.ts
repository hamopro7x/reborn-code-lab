import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const txSchema = z.object({
  external_id: z.string().trim().min(1).max(200).optional(),
  occurred_at: z.string().trim().min(4).max(40).optional(),
  amount: z.coerce.number().finite(),
  currency_code: z.string().trim().min(2).max(6).default("USD"),
  merchant: z.string().trim().min(1).max(200),
  status: z.string().trim().min(1).max(40).default("completed"),
  card_last4: z.string().trim().regex(/^\d{4}$/).optional(),
  notes: z.string().trim().max(500).optional(),
});

const bodySchema = z.union([txSchema, z.object({ transactions: z.array(txSchema).min(1).max(500) })]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-ingest-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const Route = createFileRoute("/api/public/card-transactions")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const token = request.headers.get("x-ingest-token")?.trim() ?? "";
        if (token.length < 16) {
          return Response.json({ error: "unauthorized" }, { status: 401, headers: cors });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: setting } = await supabaseAdmin
          .from("site_settings")
          .select("value")
          .eq("key", "card_ingest")
          .maybeSingle();

        const expected = String((setting?.value as { token?: string } | null)?.token ?? "");
        if (!expected || expected.length < 16 || expected !== token) {
          return Response.json({ error: "unauthorized" }, { status: 401, headers: cors });
        }

        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "invalid payload" }, { status: 400, headers: cors });
        }

        const list = "transactions" in parsed ? parsed.transactions : [parsed];
        const rows = list.map((t) => ({
          external_id: t.external_id ?? null,
          occurred_at: t.occurred_at ? new Date(t.occurred_at).toISOString() : new Date().toISOString(),
          amount: t.amount,
          currency_code: t.currency_code.toUpperCase(),
          merchant: t.merchant,
          status: t.status,
          source: "auto",
          card_last4: t.card_last4 ?? null,
          notes: t.notes ?? null,
          raw: JSON.parse(JSON.stringify(t)),
        }));

        const withId = rows.filter((r) => r.external_id);
        const withoutId = rows.filter((r) => !r.external_id);

        if (withId.length) {
          const { error } = await supabaseAdmin
            .from("card_transactions")
            .upsert(withId, { onConflict: "source,external_id", ignoreDuplicates: false });
          if (error) {
            console.error("card ingest upsert failed", error.message);
            return Response.json({ error: "save failed" }, { status: 500, headers: cors });
          }
        }
        if (withoutId.length) {
          const { error } = await supabaseAdmin.from("card_transactions").insert(withoutId);
          if (error) {
            console.error("card ingest insert failed", error.message);
            return Response.json({ error: "save failed" }, { status: 500, headers: cors });
          }
        }

        return Response.json({ ok: true, saved: rows.length }, { headers: cors });
      },
    },
  },
});
