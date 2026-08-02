import { createFileRoute } from "@tanstack/react-router";
import { AGENT_RELEASE } from "@/lib/agent-release";

// يعتمد على الإصدار المضمّن في كود الموقع، لذلك لا يظهر أي تحديث
// للموظفين قبل نشر الموقع (Publish changes).
//
// النسخ القديمة من برنامج الموظف (قبل 1.8.9) تقرأ الإصدار من إعدادات الموقع
// في قاعدة البيانات وليس من هذا المسار، فنحدّث الصف تلقائياً هنا حتى يصل
// التحديث لتلك الأجهزة أيضاً بمجرد نشر الموقع.
async function syncLegacySetting() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("site_settings")
      .select("value")
      .eq("key", "agent_update")
      .maybeSingle();
    const current = (data?.value ?? null) as { version?: string } | null;
    if (current?.version === AGENT_RELEASE.version) return;
    await supabaseAdmin
      .from("site_settings")
      .upsert(
        {
          key: "agent_update",
          value: {
            version: AGENT_RELEASE.version,
            notes: AGENT_RELEASE.notes,
            url: "https://mag-pro1.com/api/public/agent-download.exe",
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
  } catch {
    /* لا نمنع رد الإصدار لو تعذّر التحديث */
  }
}

export const Route = createFileRoute("/api/public/agent-version")({
  server: {
    handlers: {
      GET: async () => {
        await syncLegacySetting();
        return Response.json(
          {
            version: AGENT_RELEASE.version,
            notes: AGENT_RELEASE.notes,
            url: AGENT_RELEASE.url,
            size: AGENT_RELEASE.size,
            sha256: AGENT_RELEASE.sha256,
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
