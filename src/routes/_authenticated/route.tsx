import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { checkDevice } from "@/lib/courses.functions";
import { ensureDeviceChecked } from "@/lib/device-session";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2, Copy, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAdminTheme } from "@/lib/use-admin-theme";



export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // نعتمد على الجلسة المحفوظة محليًا أولاً: أي خطأ شبكة مؤقت لا يجوز أن يطرد المستخدم.
    const { data: sessionData } = await supabase.auth.getSession();
    let session = sessionData.session;

    if (session) {
      const expMs = (session.expires_at ?? 0) * 1000;
      // قرّبت على الانتهاء؟ نحاول التجديد، وفي حال فشل الشبكة نكمل بالجلسة الحالية.
      if (expMs && expMs - Date.now() < 60_000) {
        try {
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (refreshed.session) session = refreshed.session;
        } catch {
          /* تجاهل: نكمل بالجلسة الحالية */
        }
      }
      return { user: session.user };
    }

    // لا توجد جلسة محلية إطلاقًا: نتأكد مرة واحدة من السيرفر قبل التحويل.
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) return { user: data.user };
    } catch {
      /* فشل شبكة: لا نطرد المستخدم */
    }

    const next = `${location.pathname}${location.searchStr ?? ""}`;
    throw redirect({ to: "/auth", search: next && next !== "/" ? { next } : {} });
  },

  component: DeviceGate,
  errorComponent: StaffError,
});

// شاشة خطأ داخل لوحة الأدمن/الموظف بنفس الألوان الرمادية + رسالة الخطأ الحقيقية.
function StaffError({ error, reset }: { error: Error; reset: () => void }) {
  useAdminTheme();
  return (
    <div className="admin-theme min-h-dvh flex items-center justify-center p-6" dir="rtl">
      <div className="card-surface rounded-2xl p-8 max-w-md w-full text-center space-y-3">
        <ShieldAlert className="size-10 mx-auto text-muted-foreground" />
        <h1 className="text-lg font-semibold">تعذّر تحميل هذا القسم</h1>
        {error?.message ? (
          <p className="text-xs text-muted-foreground font-mono break-words bg-muted/40 rounded-lg p-2">{error.message}</p>
        ) : null}
        <div className="flex justify-center gap-2 pt-2">
          <Button onClick={() => reset()}>إعادة المحاولة</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>تحديث الصفحة</Button>
        </div>
      </div>
    </div>
  );
}


function DeviceGate() {
  useAdminTheme();
  const checkFn = useServerFn(checkDevice);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ok" }
    | { status: "blocked"; fingerprint: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { ok, fingerprint } = await ensureDeviceChecked(checkFn as any);
      if (cancelled) return;
      if (ok) setState({ status: "ok" });
      else setState({ status: "blocked", fingerprint });
    })();
    return () => { cancelled = true; };
  }, [checkFn]);

  if (state.status === "loading") {
    return (
      <div className="admin-theme min-h-screen flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (state.status === "blocked") {
    return (
      <div className="admin-theme min-h-screen flex items-center justify-center p-6" dir="rtl">

        <div className="card-surface rounded-3xl p-8 max-w-md w-full text-center space-y-4">
          <div className="size-16 rounded-2xl gradient-primary mx-auto flex items-center justify-center glow-purple">
            <ShieldAlert className="size-8 text-white" />
          </div>
          <h1 className="text-xl font-bold">الموقع محمي</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            هذا الجهاز غير مصرّح له بالدخول. أرسل الكود التالي للإدارة للحصول على الإذن.
          </p>
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">كود جهازك</div>
            <div className="p-3 rounded-xl bg-muted/50 font-mono text-xs break-all select-all border border-border">
              {state.fingerprint}
            </div>
          </div>
          <div className="flex gap-2 justify-center flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(state.fingerprint);
                toast.success("تم نسخ الكود");
              }}
            >
              <Copy className="size-4 ml-1" /> نسخ الكود
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/auth";
              }}
            >
              <LogOut className="size-4 ml-1" /> تسجيل الخروج
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            بعد تفعيل الجهاز من الإدارة، أعد تحميل الصفحة.
          </p>
        </div>
      </div>
    );
  }

  return (

    <div className="admin-theme min-h-screen">
      <Outlet />

    </div>
  );

}

