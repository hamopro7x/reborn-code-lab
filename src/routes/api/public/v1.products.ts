import { createFileRoute } from "@tanstack/react-router";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

async function authorize(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const raw = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : (request.headers.get("x-api-key") ?? "").trim();
  if (!raw) return null;

  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(raw).digest("hex");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data } = await supabaseAdmin
    .from("api_keys")
    .select("id, scopes, revoked_at, expires_at")
    .eq("key_hash", hash)
    .maybeSingle();

  if (!data || data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;

  await supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return data;
}

export const Route = createFileRoute("/api/public/v1/products")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request }) => {
        const key = await authorize(request);
        if (!key) {
          return Response.json({ error: "invalid or missing API key" }, { status: 401, headers: cors });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("products")
          .select("slug, name, short_description, base_price_egp, discount_percent, warranty_days, active")
          .eq("active", true)
          .order("sort_order");

        if (error) {
          return Response.json({ error: "failed to load products" }, { status: 500, headers: cors });
        }
        return Response.json({ data: data ?? [] }, { headers: cors });
      },
    },
  },
});
