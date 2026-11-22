import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAdminRole } from "@/lib/use-admin-role";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminLangToggle, AdminTranslator, useAdminLang } from "@/lib/admin-i18n/translator";
import { X, Lock, ChevronRight } from "lucide-react";
import { AdminBackProvider, useAdminBackTarget } from "@/components/admin/back-nav";
import { livePoll } from "@/lib/live-poll";
import { ADMIN_NAV_GROUPS } from "@/lib/admin-navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminPanelContent } from "@/components/admin/AdminPanelContent";
import { BASE_EMPLOYEE_PANELS, PANEL_KEYS, SHAREABLE_EMPLOYEE_PANELS, canEmployeeViewPanel, type PanelKey } from "@/lib/admin-panel-access";


export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [
    { title: "MG Pro | لوحة الإدارة والشفتات" },
    { name: "description", content: "لوحة MG Pro لإدارة الطلبات ومعاملات الموظفين والشفتات." },
    { property: "og:title", content: "MG Pro | لوحة الإدارة والشفتات" },
    { property: "og:description", content: "إدارة طلبات MG Pro ومعاملات الموظفين والشفتات." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (search: Record<string, unknown>): { panel?: PanelKey; message?: string } => ({
    ...(PANEL_KEYS.includes(search.panel as PanelKey) ? { panel: search.panel as PanelKey } : {}),
    ...(typeof search.message === "string" && /^[0-9a-f-]{36}$/i.test(search.message) ? { message: search.message } : {}),
  }),
  component: Admin,
});


function Admin() {
  const [adminLang, setAdminLang] = useAdminLang();
  const search = Route.useSearch();
  const role = useAdminRole();
  const navigate = useNavigate();
  // آخر قسم فتحه المستخدم — يُستعاد بعد Refresh حتى لو لم يكن في الرابط.
  const LAST_PANEL_KEY = "mp:admin.last-panel";
  const readLastPanel = (): PanelKey | null => {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(LAST_PANEL_KEY) as PanelKey | null;
    return v && PANEL_KEYS.includes(v) ? v : null;
  };
  const [panel, setPanelState] = useState<PanelKey>(search.panel ?? readLastPanel() ?? "overview");
  const setPanel = (key: PanelKey) => {
    setPanelState(key);
    try { window.localStorage.setItem(LAST_PANEL_KEY, key); } catch { /* ignore */ }
    navigate({ to: "/admin", search: { panel: key }, replace: true });
  };
  // لو فُتحت اللوحة بدون panel في الرابط، نثبّت آخر قسم في الرابط بدل الرجوع للنظرة العامة.
  useEffect(() => {
    if (!search.panel) navigate({ to: "/admin", search: { panel }, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (search.panel) setPanelState(search.panel);
  }, [search.panel]);

  const isEmployee = role === "employee";
  const adminOnly = role === "admin";
  const qc = useQueryClient();
  const sharedQ = useQuery<PanelKey[]>({
    queryKey: ["employee-panels"],
    queryFn: async (): Promise<PanelKey[]> => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "employee_panels").maybeSingle();
      const value = (data?.value ?? {}) as { panels?: unknown };
      const panels: unknown[] = Array.isArray(value.panels) ? value.panels : [];
      return panels.filter((key): key is PanelKey =>
        typeof key === "string" && PANEL_KEYS.includes(key as PanelKey) && SHAREABLE_EMPLOYEE_PANELS.includes(key as PanelKey),
      );
    },
    // Panel sharing changes rarely; a 5s poll on every admin session was pure
    // overhead. Still automatic, just far cheaper and only while visible.
    staleTime: 30_000,
    refetchInterval: livePoll(30_000),
    refetchIntervalInBackground: false,
  });
  const shared = sharedQ.data ?? [];
  const employeeAllowed = (key: PanelKey) => canEmployeeViewPanel(key, shared);
  const canView = (key: PanelKey) => adminOnly || employeeAllowed(key);
  const readOnly = isEmployee && !BASE_EMPLOYEE_PANELS.includes(panel);
  async function toggleShare(key: PanelKey, on: boolean) {
    if (!SHAREABLE_EMPLOYEE_PANELS.includes(key)) return;
    const safeShared = shared.filter((k) => SHAREABLE_EMPLOYEE_PANELS.includes(k));
    const next = on ? Array.from(new Set([...safeShared, key])) : safeShared.filter((k) => k !== key);
    const { error } = await supabase.from("site_settings").upsert({ key: "employee_panels", value: { panels: next } as any }, { onConflict: "key" });
    if (error) { toast.error("فشل الحفظ"); return; }
    toast.success(on ? "تم إظهار القسم للموظف" : "تم إخفاء القسم عن الموظف");
    qc.invalidateQueries({ queryKey: ["employee-panels"] });
  }
  // Employees only see the sections the admin shared with them.
  // مهم: لا نحوّل القسم قبل تحميل قائمة الأقسام المشتركة، وإلا يرجع الموظف
  // للطلبات بعد كل Refresh بدل ما يفضل في نفس القسم.
  useEffect(() => {
    if (!isEmployee || !sharedQ.isSuccess) return;
    if (!employeeAllowed(panel)) setPanel("orders");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmployee, sharedQ.isSuccess, panel, shared.join(",")]);


  if (role === null) return <div className="p-8 text-center">جاري التحقق...</div>;
  if (role !== "admin" && role !== "employee") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card-surface rounded-2xl p-8 text-center max-w-md">
          <X className="size-12 mx-auto text-destructive mb-2" />
          <h1 className="text-xl font-bold mb-2">غير مصرح</h1>
          <p className="text-sm text-muted-foreground mb-4">هذه الصفحة للأدمن والموظفين فقط.</p>
          <Link to="/" className="text-primary text-sm">العودة للرئيسية</Link>
        </div>
      </div>
    );
  }
  const visibleNavGroups = isEmployee
    ? ADMIN_NAV_GROUPS
        .map((g) => ({ ...g, items: g.items.filter((i) => employeeAllowed(i.key)) }))
        .filter((g) => g.items.length > 0)
    : ADMIN_NAV_GROUPS;


  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background" dir="rtl">

        <AdminSidebar
          visibleNavGroups={visibleNavGroups}
          panel={panel}
          setPanel={setPanel}
          adminOnly={adminOnly}
          employeeAllowed={employeeAllowed}
        />

        <AdminBackProvider>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b border-border/40 backdrop-blur-xl bg-background/80 sticky top-0 z-30 px-4">
            <SidebarTrigger />
            <AdminBackButton />
            <h1 className="font-bold">{visibleNavGroups.flatMap((g) => g.items).find((i) => i.key === panel)?.label}</h1>
            {adminOnly && SHAREABLE_EMPLOYEE_PANELS.includes(panel) && (
              <label className="ms-auto flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <span>إظهار للموظف (قراءة فقط)</span>
                <Switch checked={shared.includes(panel)} onCheckedChange={(v) => void toggleShare(panel, v)} />
              </label>
            )}
            {readOnly && (
              <Badge variant="outline" className="ms-auto gap-1"><Lock className="size-3" />عرض فقط</Badge>
            )}
            <div className={adminOnly && !BASE_EMPLOYEE_PANELS.includes(panel) || readOnly ? "" : "ms-auto"}>
              <AdminLangToggle lang={adminLang} onChange={setAdminLang} />
            </div>
            <AdminTranslator lang={adminLang} />
          </header>
          <main className={`flex-1 overflow-x-hidden ${panel === "chat" ? "p-0" : "p-4 md:p-6"}`}>
            <AdminPanelContent
              panel={panel}
              isEmployee={isEmployee}
              isAdmin={adminOnly}
              canView={canView}
              setPanel={setPanel}
              messageId={search.message}
            />
          </main>

        </div>
        </AdminBackProvider>
      </div>
    </SidebarProvider>
  );
}

function AdminBackButton() {
  const back = useAdminBackTarget();
  if (!back) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      className="rounded-xl gap-1 shrink-0"
      onClick={back}
      aria-label="رجوع"
    >
      <ChevronRight className="size-4" /> رجوع
    </Button>
  );
}

