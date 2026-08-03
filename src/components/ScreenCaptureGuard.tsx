import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

/**
 * حماية ضد تصوير الشاشة داخل موقع الموظف:
 * - أي محاولة Print Screen / Win+Shift+S / Ctrl+P تحوّل الشاشة لأسود فوراً
 * - عند فقدان التركيز أو تصغير النافذة (أدوات التصوير) تتحول لأسود
 * - الطباعة وحفظ الصفحة تظهر سوداء بالكامل
 */
export function ScreenCaptureGuard() {
  const [blacked, setBlacked] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const black = (ms = 1600) => {
      setBlacked(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setBlacked(false), ms);
    };

    const wipeClipboard = () => {
      try {
        navigator.clipboard?.writeText(" ");
      } catch {
        /* ignore */
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      // Print Screen (بكل صوره)
      if (k === "PrintScreen" || k === "Snapshot" || e.code === "PrintScreen") {
        black(2000);
        wipeClipboard();
        e.preventDefault();
        return;
      }
      // Win + Shift + S (أداة القص) / Ctrl+Shift+S
      if (k?.toLowerCase() === "s" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        black(4000);
        e.preventDefault();
        return;
      }
      // Ctrl/Cmd + P طباعة
      if (k?.toLowerCase() === "p" && (e.metaKey || e.ctrlKey)) {
        black(1200);
        e.preventDefault();
      }
    };

    const onBlur = () => setBlacked(true);
    const onFocus = () => setBlacked(false);
    const onVisibility = () => setBlacked(document.visibilityState === "hidden");
    const onBeforePrint = () => black(4000);

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeprint", onBeforePrint);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeprint", onBeforePrint);
    };
  }, []);

  return (
    <>
      <style>{`
        @media print {
          html, body { background: #000 !important; }
          body * { visibility: hidden !important; }
          body::after {
            content: "";
            position: fixed; inset: 0; background: #000; visibility: visible !important;
          }
        }
        .capture-guard-blackout {
          position: fixed; inset: 0; z-index: 2147483647;
          background: #000; color: #fff;
          display: flex; align-items: center; justify-content: center;
          gap: .5rem; font-size: 13px;
        }
      `}</style>
      {blacked && (
        <div className="capture-guard-blackout" dir="rtl" aria-hidden>
          <ShieldAlert className="size-4" />
          <span>المحتوى محمي — تصوير الشاشة غير مسموح</span>
        </div>
      )}
    </>
  );
}
