import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { checkDevice } from "@/lib/courses.functions";
import { ensureDeviceChecked } from "@/lib/device-session";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2, Copy, LogOut } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: DeviceGate,
});

function DeviceGate() {
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
  return (
    <div className="admin-theme min-h-screen">
      <Outlet />
    </div>
  );

}
