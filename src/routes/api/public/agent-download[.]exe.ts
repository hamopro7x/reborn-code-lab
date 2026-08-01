import { createFileRoute } from "@tanstack/react-router";
import { handleAgentDownload } from "./agent-download";

// نفس مسار التنزيل لكن بامتداد .exe حتى يتعرف برنامج الموظف على أنه ملف تثبيت
export const Route = createFileRoute("/api/public/agent-download.exe")({
  server: {
    handlers: {
      GET: ({ request }) => handleAgentDownload(request),
      HEAD: ({ request }) => handleAgentDownload(request),
    },
  },
});
