import { createFileRoute } from "@tanstack/react-router";
import { DATABASE_PUBLISHABLE_KEY, DATABASE_URL } from "@/integrations/supabase/config";

// مسار احتياطي لبرنامج الموظف: لو شبكة الجهاز مش قادرة توصل لقاعدة البيانات
// مباشرة (حجب/DNS/بطء)، البرنامج يكلم الموقع والموقع يوصل الطلب.
// الدوال المسموحة بس هي دوال البرنامج العامة أصلاً، ومحمية بسر الجهاز داخلها،
// فالمسار ده مش بيفتح أي صلاحية جديدة.
const ALLOWED = new Set([
  "agent_heartbeat",
  "agent_exchange_signals",
  "agent_pair_request",
  "agent_register",
]);
const MAX_BODY = 512 * 1024;

export const Route = createFileRoute("/api/public/agent-rpc/$fn")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const fn = params.fn;
        if (!ALLOWED.has(fn)) {
          return new Response(JSON.stringify({ message: "not allowed" }), { status: 404 });
        }
        const body = await request.text();
        if (body.length > MAX_BODY) {
          return new Response(JSON.stringify({ message: "too large" }), { status: 413 });
        }
        const url = (process.env["SUPABASE_URL"] || DATABASE_URL).replace(/\/$/, "");
        const key =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ||
          process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
          DATABASE_PUBLISHABLE_KEY;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10_000);
        try {
          const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: key },
            body: body || "{}",
            signal: ctrl.signal,
          });
          return new Response(await res.text(), {
            status: res.status,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        } catch {
          return new Response(JSON.stringify({ message: "upstream unavailable" }), { status: 502 });
        } finally {
          clearTimeout(timer);
        }
      },
    },
  },
});
