import { createFileRoute } from "@tanstack/react-router";
import { APP_BUILD_ID } from "@/lib/build-id";

// يرجّع معرّف النسخة المنشورة حالياً. المتصفح يقارنه بنسخته
// ولو اختلف يعمل تحديث تلقائي للصفحة (بدون تدخل المستخدم).
export const Route = createFileRoute("/api/public/build-version")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { build: APP_BUILD_ID },
          { headers: { "cache-control": "no-store" } },
        ),
    },
  },
});
