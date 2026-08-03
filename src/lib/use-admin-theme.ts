import { useEffect } from "react";

// يطبّق سمة الأدمن/الموظف الرمادية على مستوى <html> حتى تلتزم بها
// النوافذ المنبثقة (Dialogs / Popovers) التي تُرسم خارج شجرة الصفحة.
export function useAdminTheme() {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("admin-theme");
    return () => {
      el.classList.remove("admin-theme");
    };
  }, []);
}
