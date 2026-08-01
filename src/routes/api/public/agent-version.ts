import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/agent-version")({
  server: {
    handlers: {
      GET: async () => {
        const empty = { version: null as string | null, notes: null as string | null };
        try {
          const url = process.env["SUPABASE_URL"];
          const key =
            process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
          if (!url || !key)
            return Response.json(empty, { headers: { "cache-control": "no-store" } });
          const client = createClient(url, key, {
            auth: { persistSession: false },
            global: {
              fetch: (input, init) => {
                const h = new Headers(init?.headers);
                if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
                  h.delete("Authorization");
                h.set("apikey", key);
                return fetch(input, { ...init, headers: h });
              },
            },
          });
          const { data } = await client
            .from("site_settings")
            .select("value")
            .eq("key", "agent_update")
            .maybeSingle();
          const v = (data?.value ?? null) as { version?: string; notes?: string } | null;
          return Response.json(
            { version: v?.version ?? null, notes: v?.notes ?? null },
            { headers: { "cache-control": "no-store" } },
          );
        } catch {
          return Response.json(empty, { headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
