import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { CartProvider } from "@/lib/cart";
import { CurrencyProvider } from "@/lib/currency-context";
import { supabase } from "@/integrations/supabase/client";
import { useAutoRefreshOnDeploy } from "@/lib/use-auto-refresh";
import { useGlobalAutoSave } from "@/lib/use-global-autosave";
import { GlobalRealtime } from "@/lib/realtime/global-realtime";
import { setUiScope } from "@/lib/ui-state";
import { saveLastLocation } from "@/lib/last-location";




function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-black text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">الصفحة التي تبحث عنها غير موجودة أو تم نقلها.</p>
        <Link to="/" className="mt-6 inline-flex items-center justify-center rounded-lg gradient-primary px-6 py-2.5 text-sm font-medium text-white">
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "root" }); }, [error]);
  // لوحة الأدمن/الموظف لها سمة رمادية — نطبّقها هنا أيضاً حتى لا تظهر
  // شاشة الخطأ بالألوان البنفسجية الخاصة بالمتجر.
  const staffArea = typeof window !== "undefined" && /^\/(admin|courses|share)/.test(window.location.pathname);
  return (
    <div className={`${staffArea ? "admin-theme " : ""}flex min-h-dvh items-center justify-center px-4`} dir="rtl">
      <div className="max-w-md w-full text-center card-surface rounded-2xl p-8">
        <h1 className="text-xl font-semibold">حدث خطأ ما</h1>
        <p className="mt-2 text-sm text-muted-foreground">جرّب تحديث الصفحة أو العودة للرئيسية.</p>
        {error?.message ? (
          <p className="mt-3 text-xs text-muted-foreground break-words bg-muted/40 rounded-lg p-2 font-mono">{error.message}</p>
        ) : null}
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">إعادة المحاولة</button>
          <a href="/" className="rounded-lg border border-border px-4 py-2 text-sm">الرئيسية</a>
        </div>
      </div>
    </div>
  );
}


export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "متجر الاشتراكات الرقمية | Digital Subscriptions Store" },
      { name: "description", content: "متجر الاشتراكات الرقمية: ألعاب، أدوات ذكاء اصطناعي، قوالب تصميم وكانفا بأسعار تنافسية وضمان حقيقي." },
      { property: "og:title", content: "متجر الاشتراكات الرقمية | Digital Subscriptions Store" },
      { property: "og:description", content: "متجر الاشتراكات الرقمية: ألعاب، أدوات ذكاء اصطناعي، قوالب تصميم وكانفا بأسعار تنافسية وضمان حقيقي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "متجر الاشتراكات الرقمية | Digital Subscriptions Store" },
      { name: "twitter:description", content: "متجر الاشتراكات الرقمية: ألعاب، أدوات ذكاء اصطناعي، قوالب تصميم وكانفا بأسعار تنافسية وضمان حقيقي." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/PwuX3rY87ihAOgrut0T1r7bbc9H3/social-images/social-1784123951698-ChatGPT_Image_15_يوليو_2026،_04_52_32_م.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/PwuX3rY87ihAOgrut0T1r7bbc9H3/social-images/social-1784123951698-ChatGPT_Image_15_يوليو_2026،_04_52_32_م.webp" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://mag-pro1.com/#organization",
              name: "متجر الاشتراكات الرقمية",
              url: "https://mag-pro1.com/",
              logo: "https://mag-pro1.com/favicon.png",
            },
            {
              "@type": "WebSite",
              "@id": "https://mag-pro1.com/#website",
              name: "متجر الاشتراكات الرقمية",
              url: "https://mag-pro1.com/",
              inLanguage: "ar",
              publisher: { "@id": "https://mag-pro1.com/#organization" },
              potentialAction: {
                "@type": "SearchAction",
                target: "https://mag-pro1.com/shop?category={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            },
          ],
        }),
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" },
    ],

  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useAutoRefreshOnDeploy();
  useGlobalAutoSave();

  // حفظ آخر مكان (مسار + query) على مستوى الموقع كله حتى يرجع المستخدم
  // لنفس الصفحة/القسم بعد أي تحديث أو إعادة دخول.
  useEffect(() => {
    const record = () => {
      if (typeof window === "undefined") return;
      saveLastLocation(`${window.location.pathname}${window.location.search}`);
    };
    record();
    const unsub = router.subscribe("onResolved", record);
    return () => unsub();
  }, [router]);



  useEffect(() => {
    // نطاق حفظ حالة الواجهة = المستخدم الحالي (حتى لا تتداخل حالة
    // الأدمن/الموظف/المستخدم على نفس الجهاز).
    void supabase.auth.getUser().then(({ data }) => setUiScope(data.user?.id ?? "anon"));

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setUiScope(session?.user?.id ?? "anon");
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);
  return (
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider>
        <CartProvider>
          <GlobalRealtime />
          <Outlet />
          <Toaster position="top-center" richColors theme="dark" />
        </CartProvider>
      </CurrencyProvider>
    </QueryClientProvider>
  );
}
