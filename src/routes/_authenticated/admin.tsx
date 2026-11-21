import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarTrigger, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { SidebarGlider } from "@/components/admin/SidebarGlider";
import headerMark from "@/assets/mg-metallic-logo-3d.png";
import { AdminLangToggle, AdminTranslator, useAdminLang } from "@/lib/admin-i18n/translator";
import {
  LayoutDashboard, Package, Layers, ShoppingCart, CreditCard, Coins, Clock,
  Settings2, ExternalLink, X, Users, Star, UserCog, LogOut, GraduationCap,
  Lock, ChevronRight, FileBarChart, MonitorPlay, WalletCards, KeyRound,
  ClipboardList, Table2, MessagesSquare, Mail,
} from "lucide-react";
import { useChatBadge } from "@/lib/chat-badge";
import { ReportsTab } from "@/components/admin/ReportsTab";
import { ProductsTab } from "@/components/admin/ProductsTab";
import { AdminBackProvider, useAdminBackTarget } from "@/components/admin/back-nav";
import { BybitTab, ApiKeyPanel } from "@/components/admin/BybitTab";
import { WorkSheetPanel } from "@/components/admin/WorkSheetPanel";
import { AdminSheet } from "@/components/admin/AdminSheet";
import { GmailInbox, MailNotifier } from "@/components/admin/GmailInbox";
import { StaffChat } from "@/components/admin/StaffChat";
import { OverviewTab } from "@/components/admin/panels/OverviewTab";
import { CustomersTab } from "@/components/admin/panels/CustomersTab";
import { ReviewsTab } from "@/components/admin/panels/ReviewsTab";
import { OrdersTab } from "@/components/admin/panels/OrdersTab";
import { CategoriesTab } from "@/components/admin/panels/CategoriesTab";
import { TimersTab } from "@/components/admin/panels/TimersTab";
import { SettingsTab } from "@/components/admin/panels/SettingsTab";
import { CurrenciesTab } from "@/components/admin/panels/CurrenciesTab";
import { PaymentsTab } from "@/components/admin/panels/PaymentsTab";
import { EmployeesTab } from "@/components/admin/panels/EmployeesTab";
import { CoursesTab } from "@/components/admin/panels/CoursesTab";
import { DeviceMonitorGrid } from "@/components/admin/DeviceMonitorGrid";
import { livePoll } from "@/lib/live-poll";


type PanelKey =
  | "overview" | "orders" | "categories" | "products" | "customers" | "employees"
  | "reviews" | "payments" | "currencies" | "timers" | "settings" | "courses" | "devices" | "reports" | "remote" | "cardtx" | "apikey" | "worksheet" | "sheet" | "mail" | "chat";

const panelKeys: PanelKey[] = [
  "overview", "orders", "categories", "customers", "employees",
  "reviews", "payments", "currencies", "timers", "settings", "courses", "devices", "reports", "remote", "cardtx", "apikey", "worksheet", "sheet", "mail", "chat",
];



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
    ...(panelKeys.includes(search.panel as PanelKey) ? { panel: search.panel as PanelKey } : {}),
    ...(typeof search.message === "string" && /^[0-9a-f-]{36}$/i.test(search.message) ? { message: search.message } : {}),
  }),
  component: Admin,
});

function useRole() {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      if (roles?.some((r: any) => r.role === "admin")) setRole("admin");
      else if (roles?.some((r: any) => r.role === "employee")) setRole("employee");
      else setRole("customer");
    });
  }, []);
  return role;
}

function Admin() {
  const [adminLang, setAdminLang] = useAdminLang();
  const search = Route.useSearch();
  const role = useRole();
  const navigate = useNavigate();
  // آخر قسم فتحه المستخدم — يُستعاد بعد Refresh حتى لو لم يكن في الرابط.
  const LAST_PANEL_KEY = "mp:admin.last-panel";
  const readLastPanel = (): PanelKey | null => {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(LAST_PANEL_KEY) as PanelKey | null;
    return v && panelKeys.includes(v) ? v : null;
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
  const sharedQ = useQuery({
    queryKey: ["employee-panels"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "employee_panels").maybeSingle();
      const v = (data?.value ?? {}) as any;
      return Array.isArray(v.panels) ? (v.panels as PanelKey[]) : [];
    },
    // Panel sharing changes rarely; a 5s poll on every admin session was pure
    // overhead. Still automatic, just far cheaper and only while visible.
    staleTime: 30_000,
    refetchInterval: livePoll(30_000),
    refetchIntervalInBackground: false,
  });
  const shared = sharedQ.data ?? [];
  const basePanels: PanelKey[] = ["orders", "courses", "worksheet", "mail", "chat"];
  const employeeAllowed = (key: PanelKey) => basePanels.includes(key) || shared.includes(key);
  const canView = (key: PanelKey) => adminOnly || employeeAllowed(key);
  const readOnly = isEmployee && !basePanels.includes(panel);
  async function toggleShare(key: PanelKey, on: boolean) {
    const next = on ? Array.from(new Set([...shared, key])) : shared.filter((k) => k !== key);
    const { error } = await supabase.from("site_settings").upsert({ key: "employee_panels", value: { panels: next } as any }, { onConflict: "key" });
    if (error) { toast.error("فشل الحفظ"); return; }
    toast.success(on ? "تم إظهار القسم للموظف" : "تم إخفاء القسم عن الموظف");
    qc.invalidateQueries({ queryKey: ["employee-panels"] });
  }
  const identityFn = useServerFn(getViewerIdentity);
  const [me, setMe] = useState<{ email: string; full_name: string; avatar_url: string } | null>(null);
  useEffect(() => {
    if (role !== "admin" && role !== "employee") return;
    identityFn().then((v: any) => setMe(v)).catch(() => {});
  }, [role, identityFn]);
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
  const navGroups: { label: string; items: { key: PanelKey; label: string; icon: any; adminOnly?: boolean }[] }[] = [
    {
      label: "العمليات",
      items: [
        { key: "overview", label: "نظرة عامة", icon: LayoutDashboard },
        { key: "orders", label: "الطلبات", icon: ShoppingCart },
        { key: "customers", label: "العملاء", icon: Users },
        { key: "reviews", label: "المراجعات", icon: Star },
        { key: "reports", label: "التقارير", icon: FileBarChart, adminOnly: true },
        { key: "cardtx", label: "معاملات الفيزا", icon: WalletCards, adminOnly: true },
        { key: "worksheet", label: "جدول بيانات الشغل", icon: ClipboardList },
        { key: "sheet", label: "جدول بيانات خاص", icon: Table2, adminOnly: true },
        { key: "mail", label: "البريد", icon: Mail },
        { key: "chat", label: "جروب MG Pro", icon: MessagesSquare },


      ],
    },
    {
      label: "الكتالوج",
      items: [
        { key: "products", label: "المنتجات", icon: Package, adminOnly: true },
        { key: "categories", label: "الأقسام", icon: Layers, adminOnly: true },
        { key: "timers", label: "مؤقتات العروض", icon: Clock },
      ],
    },
    {
      label: "الإدارة",
      items: [
        { key: "employees", label: "الموظفون", icon: UserCog, adminOnly: true },
        { key: "courses", label: "كورسات التدريب", icon: GraduationCap },
        
        { key: "remote", label: "الوصول عن بُعد", icon: MonitorPlay, adminOnly: true },
        { key: "payments", label: "طرق الدفع", icon: CreditCard, adminOnly: true },
        { key: "currencies", label: "العملات", icon: Coins, adminOnly: true },
        { key: "apikey", label: "مفاتيح API (Bybit)", icon: KeyRound, adminOnly: true },
        { key: "settings", label: "الإعدادات", icon: Settings2, adminOnly: true },
      ],
    },
  ];
  const visibleNavGroups = isEmployee
    ? navGroups
        .map((g) => ({ ...g, items: g.items.filter((i) => employeeAllowed(i.key)) }))
        .filter((g) => g.items.length > 0)
    : navGroups;


  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background" dir="rtl">

        <Sidebar side="right" collapsible="icon">
          <SidebarHeader className="p-0">
            <div className="flex items-center justify-center px-1 py-1.5">
              <img src={headerMark} alt="MG Pro" className="w-full max-h-24 object-contain" />
            </div>


          </SidebarHeader>
          <SidebarContent>
            <SidebarGlider activeKey={panel}>
              {visibleNavGroups.map((g) => (
                <SidebarGroup key={g.label}>
                  <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {g.items.filter((i) => adminOnly || employeeAllowed(i.key)).map((i) => (
                        <SidebarMenuItem key={i.key}>
                          <SidebarMenuButton isActive={panel === i.key} onClick={() => setPanel(i.key)}>
                            <i.icon className="size-4" />
                            <span>{i.label}</span>{i.key === "chat" && <ChatNavBadge />}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarGlider>
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border">
            <SidebarMenu>
              {adminOnly && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/"><ExternalLink className="size-4" /><span>عرض الموقع</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton onClick={async () => { await supabase.auth.signOut(); window.location.replace("/auth"); }}>
                  <LogOut className="size-4" /><span>خروج</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <AdminBackProvider>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b border-border/40 backdrop-blur-xl bg-background/80 sticky top-0 z-30 px-4">
            <SidebarTrigger />
            <AdminBackButton />
            <h1 className="font-bold">{visibleNavGroups.flatMap((g) => g.items).find((i) => i.key === panel)?.label}</h1>
            {adminOnly && !basePanels.includes(panel) && (
              <label className="ms-auto flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <span>إظهار للموظف (قراءة فقط)</span>
                <Switch checked={shared.includes(panel)} onCheckedChange={(v) => void toggleShare(panel, v)} />
              </label>
            )}
            {readOnly && (
              <Badge variant="outline" className="ms-auto gap-1"><Lock className="size-3" />عرض فقط</Badge>
            )}
            <div className={adminOnly && !basePanels.includes(panel) || readOnly ? "" : "ms-auto"}>
              <AdminLangToggle lang={adminLang} onChange={setAdminLang} />
            </div>
            <AdminTranslator lang={adminLang} />
          </header>
          <main className={`flex-1 overflow-x-hidden ${panel === "chat" ? "p-0" : "p-4 md:p-6"}`}>
            {isEmployee && panel === "orders" && (
              <div className="card-surface rounded-2xl p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold">نسخة الموظف (Windows)</h3>
                  <p className="text-sm text-muted-foreground">
                    نزّل ملف التثبيت واشتغل عليه مرة واحدة — بعدها البرنامج يعمل تلقائيًا في الخلفية.
                  </p>
                </div>
                <a
                  href="/api/public/agent-download.exe"
                  download="MagPro-Setup.exe"
                  className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  تنزيل نسخة الموظف
                </a>
              </div>
            )}
            <div className="min-w-0">
            {canView("mail") && <MailNotifier onOpen={() => setPanel("mail")} />}
            {panel === "overview" && canView("overview") && <OverviewTab />}
            {panel === "orders" && <OrdersTab isAdmin={adminOnly} />}

            {panel === "customers" && canView("customers") && <CustomersTab />}
            {panel === "reviews" && canView("reviews") && <ReviewsTab />}
            {panel === "reports" && canView("reports") && <ReportsTab />}
            {panel === "cardtx" && canView("cardtx") && <BybitTab isAdmin={adminOnly} />}
            {panel === "worksheet" && canView("worksheet") && <WorkSheetPanel isAdmin={adminOnly} />}
            {panel === "sheet" && adminOnly && <AdminSheet />}
            {panel === "mail" && canView("mail") && <GmailInbox isAdmin={adminOnly} />}
            {panel === "chat" && <StaffChat targetId={search.message} />}


            
            {panel === "products" && canView("products") && <ProductsTab />}
            {panel === "categories" && canView("categories") && <CategoriesTab />}
            {panel === "timers" && canView("timers") && <TimersTab />}
            {panel === "employees" && canView("employees") && <EmployeesTab />}
            {panel === "courses" && <CoursesTab isAdmin={adminOnly} />}

            {panel === "remote" && canView("remote") && <DeviceMonitorGrid screensOnly />}
            {panel === "payments" && canView("payments") && <PaymentsTab />}
            {panel === "currencies" && canView("currencies") && <CurrenciesTab />}
            {panel === "apikey" && adminOnly && (
              <div className="space-y-4 text-right" dir="rtl">
                <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
                  <h2 className="text-sm font-black">مفاتيح API — حسابات Bybit</h2>
                  <p className="mt-1 text-[12px] text-muted-foreground leading-6">
                    من هنا تربط حسابات Bybit بمفتاح API (قراءة فقط). الحسابات المضافة تظهر تلقائياً في قسم معاملات الفيزا.
                  </p>
                </div>
                <ApiKeyPanel />
              </div>
            )}
            {panel === "settings" && canView("settings") && <SettingsTab />}
            </div>
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

function ChatNavBadge() {
  const n = useChatBadge();
  if (!n) return null;
  return <span className="ms-auto min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center">{n > 99 ? "99+" : n}</span>;
}
