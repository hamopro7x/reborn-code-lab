import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase client reads its session from localStorage.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = (data as any)?.redirect_url ?? (data as any)?.redirect_to;
    if (immediate && !(data as any)?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main dir="rtl" className="min-h-screen flex items-center justify-center px-4 text-center">
      <div className="card-surface rounded-3xl p-8 max-w-md">
        <h1 className="text-xl font-bold mb-2">تعذّر تحميل طلب الربط</h1>
        <p className="text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
      </div>
    </main>
  ),
  head: () => ({ meta: [{ title: "ربط تطبيق | mag-pro1.com" }, { name: "robots", content: "noindex, nofollow" }] }),
});

function Consent() {
  const details = Route.useLoaderData() as any;
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "التطبيق";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorization_id)
      : await supabase.auth.oauth.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = (data as any)?.redirect_url ?? (data as any)?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("لم يُرجع خادم المصادقة رابط إعادة توجيه.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main dir="rtl" className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md card-surface rounded-3xl p-8 glow-purple">
        <div className="size-14 rounded-2xl gradient-primary mx-auto flex items-center justify-center mb-4">
          <ShieldCheck className="size-7 text-white" />
        </div>
        <h1 className="text-xl font-semibold text-center text-gradient">ربط {clientName} بحسابك</h1>
        <p className="text-sm text-muted-foreground text-center mt-3">
          سيتمكن {clientName} من استخدام أدوات المتجر نيابةً عنك بنفس صلاحيات حسابك (المنتجات، الطلبات، وملخص المبيعات).
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive text-center mt-4">
            {error}
          </p>
        )}
        <div className="flex gap-2 mt-6">
          <Button disabled={busy} onClick={() => decide(true)} className="flex-1 h-11 gradient-primary text-white">
            موافقة
          </Button>
          <Button disabled={busy} variant="outline" onClick={() => decide(false)} className="flex-1 h-11">
            رفض
          </Button>
        </div>
      </div>
    </main>
  );
}
