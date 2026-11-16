import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import { DATABASE_PUBLISHABLE_KEY, DATABASE_URL, requireCurrentDatabaseUrl } from "@/integrations/supabase/config";
import { SERVER_DB_TIMEOUT_MS, withRequestTimeout } from "@/integrations/supabase/timeout-fetch";
import { chatGateExempt } from "./chat-access-rules";

export async function enforceChatReadBarrier(filename: string, name: string) {
  if (chatGateExempt(filename, name)) return;
  const request = getRequest();
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return; // Public calls retain their existing behavior/authentication boundary.
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || DATABASE_PUBLISHABLE_KEY;
  const url = requireCurrentDatabaseUrl(process.env["SUPABASE_URL"] || DATABASE_URL);
  const timedFetch = withRequestTimeout(fetch, SERVER_DB_TIMEOUT_MS);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization }, fetch: (input, init) => {
      const headers = new Headers(init?.headers); headers.set("apikey", key);
      return timedFetch(input, { ...init, headers });
    } },
  });
  const { data: claims, error: authError } = await db.auth.getClaims(authorization.slice(7));
  if (authError || !claims?.claims.sub) throw new Error("غير مصرح");
  const { data: roles, error: roleError } = await db.from("user_roles").select("role").eq("user_id", claims.claims.sub);
  if (roleError) throw new Error("تعذر التحقق من الصلاحيات");
  if (!(roles ?? []).some((r) => r.role === "employee") || (roles ?? []).some((r) => r.role === "admin")) return;
  const { data: state, error } = await db.rpc("staff_chat_status");
  if (error?.code === "PGRST202" || error?.code === "42883") return;
  if (error || !state) throw new Error("تعذر التحقق من القراءة الإجبارية");
  if (state.pending?.length) throw new Error("أكد قراءة رسائل الجروب الإجبارية أولًا");
}