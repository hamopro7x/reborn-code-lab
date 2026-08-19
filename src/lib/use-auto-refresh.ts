import { useEffect } from "react";
import { APP_BUILD_ID } from "./build-id";
import { uploadManager } from "./upload-manager";

// يفحص إذا كان في نسخة جديدة منشورة من الموقع، ولو موجودة
// يعمل تحديث تلقائي للصفحة الحالية فوراً (نفس المسار).
export function useAutoRefreshOnDeploy(intervalMs = 60_000) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let stopped = false;

    const check = async () => {
      if (stopped || document.hidden) return;
      // لا نعمل تحديث للصفحة أثناء رفع فيديوهات
      if (uploadManager.hasActive()) return;
      try {
        const res = await fetch("/api/public/build-version", { cache: "no-store" });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (!build || build === "dev" || build === APP_BUILD_ID) return;
        stopped = true;
        window.location.reload();
      } catch {
        /* تجاهل أخطاء الشبكة المؤقتة */
      }
    };

    const timer = window.setInterval(check, intervalMs);
    const onVisible = () => { if (!document.hidden) void check(); };
    document.addEventListener("visibilitychange", onVisible);
    void check();

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
}
