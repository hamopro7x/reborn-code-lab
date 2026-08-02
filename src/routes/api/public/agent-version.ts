import { createFileRoute } from "@tanstack/react-router";
import { AGENT_RELEASE } from "@/lib/agent-release";

// يعتمد على الإصدار المضمّن في كود الموقع، لذلك لا يظهر أي تحديث
// للموظفين قبل نشر الموقع (Publish changes).
export const Route = createFileRoute("/api/public/agent-version")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { version: AGENT_RELEASE.version, notes: AGENT_RELEASE.notes },
          { headers: { "cache-control": "no-store" } },
        ),
    },
  },
});
