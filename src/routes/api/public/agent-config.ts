import { createFileRoute } from "@tanstack/react-router";
import { DATABASE_PUBLISHABLE_KEY, DATABASE_URL } from "@/integrations/supabase/config";

// بيانات الاتصال العامة لبرنامج الموظف. البرنامج يقرأها عند كل تشغيل، فأي
// تغيير للمفاتيح لاحقاً لا يحتاج إصدار جديد من البرنامج.
export const Route = createFileRoute("/api/public/agent-config")({
  server: {
    handlers: {
      GET: async () => {
        const url = (process.env["SUPABASE_URL"] || DATABASE_URL).replace(/\/$/, "");
        const key =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ||
          process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
          DATABASE_PUBLISHABLE_KEY;
        return new Response(JSON.stringify({ url, key }), {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
