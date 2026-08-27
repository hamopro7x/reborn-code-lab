import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger,
  SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, Package, Layers, ShoppingCart, CreditCard, Coins, Clock, Settings2,
  Plus, Trash2, Edit, ExternalLink, Check, X, TrendingUp, DollarSign, Users, Bell, Loader2,
  Star, UserCog, LogOut, Repeat, ArrowUpRight, GraduationCap, MonitorSmartphone, Upload, PlayCircle,
  Lock, Camera, Download, ChevronRight,
} from "lucide-react";

import { useServerFn } from "@tanstack/react-start";
import { createEmployee, deleteEmployee, listEmployees, listCustomers, updateEmployeeAvatar, deleteAllOrders, updateEmployee } from "@/lib/admin.functions";
import { adminListDevices, adminDeleteDevice, adminResetUserDevices, adminAddDevice, adminListEmployees,
  adminListCourseAccess, adminGrantCourseAccess, adminRevokeCourseAccess, checkDevice, getViewerIdentity } from "@/lib/courses.functions";
import { getDeviceFingerprint } from "@/lib/device";
import { ShieldAlert } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ReportsTab } from "@/components/admin/ReportsTab";
import { AdminBackProvider, useAdminBack, useAdminBackTarget } from "@/components/admin/back-nav";
import { BybitTab, ApiKeyPanel } from "@/components/admin/BybitTab";
import { RedotPayPanel } from "@/components/admin/RedotPayPanel";
import { FileBarChart, MonitorPlay, Image as ImageIcon, ChevronUp, ChevronDown, WalletCards, KeyRound, ClipboardList, Table2 } from "lucide-react";
import { WorkSheetPanel } from "@/components/admin/WorkSheetPanel";
import { LessonUploader } from "@/components/admin/LessonUploader";
import { DeviceMonitorGrid } from "@/components/admin/DeviceMonitorGrid";
import { EmployeeDevices } from "@/components/admin/DeviceMonitorGrid";


type PanelKey =
  | "overview" | "orders" | "products" | "categories" | "customers" | "employees"
  | "reviews" | "payments" | "currencies" | "timers" | "settings" | "courses" | "devices" | "reports" | "remote" | "cardtx" | "apikey" | "worksheet" | "sheet";

const panelKeys: PanelKey[] = [
  "overview", "orders", "products", "categories", "customers", "employees",
  "reviews", "payments", "currencies", "timers", "settings", "courses", "devices", "reports", "remote", "cardtx", "apikey", "worksheet", "sheet",
];



export const Route = createFileRoute("/_authenticated/admin")({
  validateSearch: (search: Record<string, unknown>): { panel?: PanelKey } =>
    panelKeys.includes(search.panel as PanelKey) ? { panel: search.panel as PanelKey } : {},
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
  const search = Route.useSearch();
  const role = useRole();
  const navigate = useNavigate();
  const [panel, setPanelState] = useState<PanelKey>(search.panel ?? "overview");
  const setPanel = (key: PanelKey) => {
    setPanelState(key);
    navigate({ to: "/admin", search: { panel: key }, replace: true });
  };
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
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const shared = sharedQ.data ?? [];
  const basePanels: PanelKey[] = ["orders", "courses", "worksheet"];
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
  // Employees only see the sections the admin shared with them
  useEffect(() => {
    if (isEmployee && !employeeAllowed(panel)) setPanel("orders");
  }, [isEmployee, panel, shared.join(",")]);

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


      ],
    },
    {
      label: "الكتالوج",
      items: [
        { key: "products", label: "المنتجات", icon: Package },
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
          <SidebarHeader className="border-b border-sidebar-border">
            <div className="flex items-center gap-2 p-2">
              <div className="size-9 rounded-xl gradient-primary flex items-center justify-center shrink-0 overflow-hidden">
                {me?.avatar_url ? (
                  <img src={me.avatar_url} alt={me?.full_name || "avatar"} className="w-full h-full object-cover" />
                ) : (
                  <LayoutDashboard className="size-5 text-white" />
                )}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm text-gradient truncate">لوحة التحكم</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {adminOnly ? "أدمن" : `موظف : ${me?.full_name || me?.email?.split("@")[0] || ""}`}
                </div>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            {visibleNavGroups.map((g) => (
              <SidebarGroup key={g.label}>
                <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {g.items.filter((i) => adminOnly || employeeAllowed(i.key)).map((i) => (
                      <SidebarMenuItem key={i.key}>
                        <SidebarMenuButton isActive={panel === i.key} onClick={() => setPanel(i.key)}>
                          <i.icon className="size-4" />
                          <span>{i.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
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
                <SidebarMenuButton onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}>
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
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
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
            {panel === "overview" && canView("overview") && <OverviewTab />}
            {panel === "orders" && <OrdersTab isAdmin={adminOnly} />}

            {panel === "customers" && canView("customers") && <CustomersTab />}
            {panel === "reviews" && canView("reviews") && <ReviewsTab />}
            {panel === "reports" && canView("reports") && <ReportsTab />}
            {panel === "cardtx" && canView("cardtx") && <BybitTab isAdmin={adminOnly} />}
            {panel === "worksheet" && canView("worksheet") && <WorkSheetPanel isAdmin={adminOnly} />}

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

// ============ READ ONLY WRAPPER ============

// ============ OVERVIEW ============

function OverviewTab() {
  const qc = useQueryClient();
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [orders, products, users] = await Promise.all([
        supabase.from("orders").select("id,total,status,created_at"),
        supabase.from("products").select("id"),
        supabase.from("profiles").select("id"),
      ]);
      const ords = (orders.data ?? []) as any[];
      const revenue = ords.filter((o) => o.status === "confirmed" || o.status === "completed").reduce((s, o) => s + Number(o.total), 0);
      const pending = ords.filter((o) => o.status === "awaiting_confirmation").length;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayCount = ords.filter((o) => new Date(o.created_at) >= today).length;
      return {
        total: ords.length,
        revenue: revenue.toFixed(2),
        pending,
        todayCount,
        products: products.data?.length ?? 0,
        users: users.data?.length ?? 0,
      };
    },
  });
  const notifQ = useQuery({
    queryKey: ["admin-notifs"],
    queryFn: async () => (await supabase.from("admin_notifications").select("*").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });
  async function markRead(id: string) {
    await supabase.from("admin_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-notifs"] });
  }
  const s = stats.data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "إجمالي الطلبات", value: s?.total ?? "-", icon: ShoppingCart },
          { label: "الطلبات الجديد", value: s?.pending ?? "-", icon: Loader2 },
          { label: "طلبات اليوم", value: s?.todayCount ?? "-", icon: TrendingUp },
          { label: "الإيرادات (ج.م)", value: s?.revenue ?? "-", icon: DollarSign },
          { label: "المنتجات", value: s?.products ?? "-", icon: Package },
          { label: "العملاء", value: s?.users ?? "-", icon: Users },
        ].map((c) => (
          <div key={c.label} className="card-surface rounded-2xl p-4">
            <c.icon className="size-5 text-primary mb-2" />
            <div className="text-[11px] text-muted-foreground">{c.label}</div>
            <div className="text-xl md:text-2xl font-black mt-1">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="card-surface rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="size-5 text-primary" />
          <h3 className="font-bold">الإشعارات والتنبيهات</h3>
          {(notifQ.data ?? []).filter((n: any) => !n.read_at).length > 0 && (
            <Badge>{(notifQ.data ?? []).filter((n: any) => !n.read_at).length} جديد</Badge>
          )}
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {(notifQ.data ?? []).length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-6">لا توجد إشعارات</div>
          )}
          {(notifQ.data ?? []).map((n: any) => (
            <div key={n.id} className={`rounded-xl p-3 flex items-start gap-3 ${n.read_at ? "bg-muted/30" : "bg-primary/10 border border-primary/30"}`}>
              <div className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${n.kind === "repeat_customer" ? "bg-yellow-500/20 text-yellow-500" : "bg-primary/20 text-primary"}`}>
                {n.kind === "repeat_customer" ? <Repeat className="size-5" /> : <Bell className="size-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">{n.title}</div>
                {n.body && <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>}
                <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString("ar-EG")}</div>
              </div>
              {!n.read_at && (
                <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}><Check className="size-4" /></Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ CUSTOMERS ============
function CustomersTab() {
  const list = useServerFn(listCustomers);
  const q = useQuery({ queryKey: ["admin-customers"], queryFn: () => list() as Promise<any[]> });
  const [search, setSearch] = useState("");
  const rows = (q.data ?? []).filter((r) => {
    const s = search.toLowerCase();
    return !s || r.email.toLowerCase().includes(s) || r.name.toLowerCase().includes(s) || r.phone.includes(s);
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold">العملاء ({q.data?.length ?? 0})</h2>
          <p className="text-xs text-muted-foreground">تحليل سلوك الشراء — العملاء المتكررون في الأعلى</p>
        </div>
        <Input placeholder="بحث بالاسم أو الإيميل أو الرقم..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      </div>
      <div className="space-y-3">
        {rows.map((c) => (
          <div key={c.email + c.phone} className={`card-surface rounded-2xl p-4 ${c.orders >= 2 ? "border-2 border-yellow-500/40" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-bold">{c.name}</div>
                  {c.orders >= 2 && (
                    <Badge className="bg-yellow-500 text-black gap-1">
                      <Repeat className="size-3" />عميل متكرر × {c.orders}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{c.email} · {c.phone} · {c.country}</div>
                <div className="text-[11px] text-muted-foreground mt-1">آخر طلب: {new Date(c.last_at).toLocaleString("ar-EG")}</div>
              </div>
              <div className="text-left">
                <div className="text-xs text-muted-foreground">إجمالي المشتريات المؤكدة</div>
                <div className="space-y-0.5 mt-1">
                  {Object.entries(c.total_by_currency).map(([code, val]) => (
                    <div key={code} className="font-bold text-gradient text-sm">{Number(val).toFixed(2)} {code}</div>
                  ))}
                  {Object.keys(c.total_by_currency).length === 0 && <div className="text-xs text-muted-foreground">—</div>}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{c.confirmed} مؤكد / {c.orders} إجمالي</div>
              </div>
            </div>
            {c.orders >= 2 && (
              <a
                href={`https://wa.me/${c.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("مرحباً " + c.name + "، شكراً لثقتك بنا 🌟")}`}
                target="_blank" rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ArrowUpRight className="size-3" />تواصل عبر واتساب لعرض منتج جديد
              </a>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="card-surface rounded-2xl p-12 text-center text-muted-foreground">لا يوجد عملاء</div>}
      </div>
    </div>
  );
}

// ============ REVIEWS ============
function ReviewsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "approved" | "all">("pending");
  const q = useQuery({
    queryKey: ["admin-reviews", filter],
    queryFn: async () => {
      let qb = supabase.from("reviews").select("*, product:products(name, slug)").order("created_at", { ascending: false });
      if (filter === "pending") qb = qb.eq("approved", false);
      if (filter === "approved") qb = qb.eq("approved", true);
      return (await qb).data ?? [];
    },
  });
  async function approve(id: string, val: boolean) {
    await supabase.from("reviews").update({ approved: val }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    toast.success(val ? "تم النشر" : "تم الإخفاء");
  }
  async function del(id: string) {
    if (!confirm("حذف المراجعة؟")) return;
    await supabase.from("reviews").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-reviews"] });
  }
  const [addOpen, setAddOpen] = useState(false);
  const [newR, setNewR] = useState<any>({ product_id: "", customer_name: "", rating: 5, comment: "", approved: true });
  const productsQ = useQuery({ queryKey: ["reviews-products"], queryFn: async () => (await supabase.from("products").select("id,name")).data ?? [] });
  async function saveNew() {
    if (!newR.product_id || !newR.customer_name) return toast.error("أكمل البيانات");
    const { error } = await supabase.from("reviews").insert(newR);
    if (error) toast.error(error.message);
    else { toast.success("تم"); setAddOpen(false); setNewR({ product_id: "", customer_name: "", rating: 5, comment: "", approved: true }); qc.invalidateQueries({ queryKey: ["admin-reviews"] }); }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["pending","approved","all"] as const).map((k) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-lg text-xs ${filter === k ? "gradient-primary text-white" : "card-surface"}`}>
              {k === "pending" ? "بانتظار الموافقة" : k === "approved" ? "منشور" : "الكل"}
            </button>
          ))}
        </div>
        <Button onClick={() => setAddOpen(true)} className="gradient-primary text-white gap-1"><Plus className="size-4" />إضافة مراجعة</Button>
      </div>
      <div className="space-y-3">
        {(q.data ?? []).map((r: any) => (
          <div key={r.id} className="card-surface rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold">{r.customer_name}</span>
                  <div className="flex">{[1,2,3,4,5].map((n) => <Star key={n} className={`size-3.5 ${n <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-muted"}`} />)}</div>
                  {r.approved ? <Badge>منشور</Badge> : <Badge variant="secondary">بانتظار</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">على: {r.product?.name}</div>
                {r.comment && <p className="text-sm mt-2">{r.comment}</p>}
                <div className="text-[10px] text-muted-foreground mt-1">{new Date(r.created_at).toLocaleString("ar-EG")}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant={r.approved ? "outline" : "default"} onClick={() => approve(r.id, !r.approved)} className={!r.approved ? "gradient-primary text-white" : ""}>
                  {r.approved ? "إخفاء" : <><Check className="size-4 ml-1" />نشر</>}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => del(r.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </div>
          </div>
        ))}
        {(q.data ?? []).length === 0 && <div className="card-surface rounded-2xl p-12 text-center text-muted-foreground">لا توجد مراجعات</div>}
      </div>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>إضافة مراجعة يدوية</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>المنتج</Label>
              <select value={newR.product_id} onChange={(e) => setNewR({ ...newR, product_id: e.target.value })} className="w-full h-10 rounded-md border border-input bg-input px-3 text-sm">
                <option value="">— اختر —</option>
                {(productsQ.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><Label>اسم العميل</Label><Input value={newR.customer_name} onChange={(e) => setNewR({ ...newR, customer_name: e.target.value })} /></div>
            <div><Label>التقييم (1-5)</Label><Input type="number" min={1} max={5} value={newR.rating} onChange={(e) => setNewR({ ...newR, rating: Number(e.target.value) })} /></div>
            <div><Label>التعليق</Label><Textarea rows={3} value={newR.comment} onChange={(e) => setNewR({ ...newR, comment: e.target.value })} /></div>
            <label className="flex items-center gap-2"><Switch checked={newR.approved} onCheckedChange={(v) => setNewR({ ...newR, approved: v })} /> نشر مباشرة</label>
          </div>
          <DialogFooter><Button onClick={saveNew} className="gradient-primary text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ EMPLOYEES ============
function EmployeesTab() {
  const qc = useQueryClient();
  const list = useServerFn(listEmployees);
  const create = useServerFn(createEmployee);
  const del = useServerFn(deleteEmployee);
  const updAvatar = useServerFn(updateEmployeeAvatar);
  const q = useQuery({ queryKey: ["admin-employees"], queryFn: () => list() as Promise<any[]> });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const upd = useServerFn(updateEmployee);
  const [editing, setEditing] = useState<{ user_id: string; full_name: string; email: string; password: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [prof, setProf] = useState<{ user_id: string; full_name: string; email: string; password: string } | null>(null);

  async function saveProfile() {
    if (!prof) return;
    if (prof.full_name.trim().length < 2) return toast.error("اكتب اسم صحيح");
    if (prof.password && prof.password.length < 6) return toast.error("كلمة السر 6 أحرف على الأقل");
    setSavingEdit(true);
    try {
      await upd({ data: {
        user_id: prof.user_id,
        full_name: prof.full_name.trim(),
        email: prof.email.trim(),
        ...(prof.password ? { password: prof.password } : {}),
      } });
      toast.success("تم تحديث بيانات الموظف");
      setProf({ ...prof, password: "" });
      qc.invalidateQueries({ queryKey: ["admin-employees"] });
    } catch (e: any) { toast.error(e?.message ?? "خطأ"); }
    finally { setSavingEdit(false); }
  }

  async function saveEdit() {
    if (!editing) return;
    if (editing.full_name.trim().length < 2) return toast.error("اكتب اسم صحيح");
    if (editing.password && editing.password.length < 6) return toast.error("كلمة السر 6 أحرف على الأقل");
    setSavingEdit(true);
    try {
      await upd({ data: {
        user_id: editing.user_id,
        full_name: editing.full_name.trim(),
        email: editing.email.trim(),
        ...(editing.password ? { password: editing.password } : {}),
      } });
      toast.success("تم تحديث بيانات الموظف");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-employees"] });
    } catch (e: any) { toast.error(e?.message ?? "خطأ"); }
    finally { setSavingEdit(false); }
  }

  const latestAgent = useQuery({
    queryKey: ["agent-latest-version"],
    queryFn: async () => {
      const r = await fetch("/api/public/agent-version", { cache: "no-store" });
      if (!r.ok) return { version: null, notes: null };
      return (await r.json()) as { version: string | null; notes: string | null };
    },
    refetchInterval: 60_000,
  });


  async function onPickAvatar(userId: string, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("الملف يجب أن يكون صورة");
    if (file.size > 5 * 1024 * 1024) return toast.error("الحد الأقصى 5 ميجا");
    setUploadingId(userId);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true, contentType: file.type,
      });
      if (upErr) throw upErr;
      await updAvatar({ data: { user_id: userId, path } });
      toast.success("تم رفع الصورة");
      qc.invalidateQueries({ queryKey: ["admin-employees"] });
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الرفع");
    } finally {
      setUploadingId(null);
    }
  }

  async function submit() {
    if (!form.email || !form.password || !form.full_name) return toast.error("أكمل البيانات");
    if (form.password.length < 6) return toast.error("كلمة السر 6 أحرف على الأقل");
    try {
      await create({ data: form });
      toast.success("تم إضافة الموظف");
      setOpen(false); setForm({ email: "", password: "", full_name: "" });
      qc.invalidateQueries({ queryKey: ["admin-employees"] });
    } catch (e: any) { toast.error(e?.message ?? "خطأ"); }
  }
  async function remove(uid: string) {
    if (!confirm("حذف هذا المستخدم نهائياً؟")) return;
    try {
      await del({ data: { user_id: uid } });
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["admin-employees"] });
    } catch (e: any) { toast.error(e?.message ?? "خطأ"); }
  }

  const selected = (q.data ?? []).find((u: any) => u.user_id === expanded) ?? null;

  useEffect(() => {
    if (!selected) { setProf(null); return; }
    setProf((p) => (p && p.user_id === selected.user_id ? p : {
      user_id: selected.user_id,
      full_name: selected.full_name ?? "",
      email: selected.email ?? "",
      password: "",
    }));
  }, [selected?.user_id, selected]);

  useAdminBack(selected ? () => setExpanded(null) : null, [selected?.user_id]);

  if (selected) {
    const u: any = selected;
    return (
      <div className="space-y-4">

        <div className="card-surface rounded-2xl p-6 flex flex-col items-center text-center gap-3">
          <button
            type="button"
            onClick={() => fileRefs.current[u.user_id]?.click()}
            disabled={uploadingId === u.user_id}
            className="relative size-28 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 group border border-border hover:border-primary transition"
            title="تغيير الصورة"
          >
            {u.avatar_signed_url ? (
              <img src={u.avatar_signed_url} alt={u.full_name || u.email} className="size-full object-cover" />
            ) : (
              <span className="text-4xl font-bold text-muted-foreground">
                {(u.full_name || u.email || "?").trim().charAt(0).toUpperCase()}
              </span>
            )}
            <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
              {uploadingId === u.user_id
                ? <Loader2 className="size-5 text-white animate-spin" />
                : <Camera className="size-5 text-white" />}
            </span>
          </button>
          <input
            ref={(el) => { fileRefs.current[u.user_id] = el; }}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              onPickAvatar(u.user_id, f);
              e.target.value = "";
            }}
          />
          <div>
            <div className="text-lg font-bold">{u.full_name || u.email.split("@")[0]}</div>
          </div>

          <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role === "admin" ? "أدمن" : "موظف"}</Badge>
        </div>

        <div className="card-surface rounded-2xl p-4 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">البيانات الشخصية</h3>
              <div className="flex items-center gap-1">
                <Button size="sm" onClick={saveProfile} disabled={savingEdit} className="gradient-primary text-white">
                  {savingEdit ? <Loader2 className="size-4 animate-spin" /> : "حفظ"}
                </Button>
                {u.role !== "admin" && (
                  <Button size="icon" variant="ghost" onClick={() => { remove(u.user_id); setExpanded(null); }}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-border/60 p-4 text-right">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">الاسم كامل</div>
                  <Input value={prof?.full_name ?? ""} onChange={(e) => setProf({ ...(prof ?? { user_id: u.user_id, full_name: "", email: "", password: "" }), full_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">البريد الإلكتروني</div>
                  <Input type="email" dir="ltr" style={{ textAlign: "right" }} value={prof?.email ?? ""} onChange={(e) => setProf({ ...(prof ?? { user_id: u.user_id, full_name: "", email: "", password: "" }), email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">كلمة السر</div>
                  <Input type="password" placeholder="اتركها فاضية لو مش عايز تغييرها" value={prof?.password ?? ""} onChange={(e) => setProf({ ...(prof ?? { user_id: u.user_id, full_name: "", email: "", password: "" }), password: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">الصلاحية</div>
                  <div className="rounded-md bg-muted/60 border border-border/50 px-3 py-2.5 text-sm font-medium truncate">{u.role === "admin" ? "أدمن" : "موظف"}</div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">تاريخ الإضافة</div>
                  <div className="rounded-md bg-muted/60 border border-border/50 px-3 py-2.5 text-sm font-medium truncate">{new Date(u.created_at).toLocaleString("ar-EG")}</div>
                </div>
              </div>
            </div>


          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="min-w-0 card-surface rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold">أجهزة الموظف</h3>
            <EmployeeDevices userId={u.user_id} employeeName={u.full_name} />
          </div>
          <div className="min-w-0 card-surface rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2"><MonitorSmartphone className="size-4 text-primary" /> تفعيل جهاز الموظف</h3>
            <DevicesTab userId={u.user_id} employeeName={u.full_name} />
          </div>
        </div>



        <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>تعديل بيانات الموظف</DialogTitle></DialogHeader>
            {editing && (
              <div className="space-y-3">
                <div><Label>الاسم الكامل</Label><Input value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} /></div>
                <div><Label>البريد الإلكتروني</Label><Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
                <div><Label>كلمة سر جديدة (اختياري)</Label><Input type="password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} placeholder="اتركها فاضية لو مش عايز تغييرها" /></div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={saveEdit} disabled={savingEdit} className="gradient-primary text-white">
                {savingEdit ? <Loader2 className="size-4 animate-spin" /> : "حفظ"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold">الموظفون</h2>
          <p className="text-xs text-muted-foreground">الموظف يقدر يدير الطلبات والمنتجات والمراجعات — بدون طرق الدفع والعملات والإعدادات</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col items-end gap-1">
            <a
              href="/api/public/agent-download.exe"
              download={`MagProAgent-Setup${latestAgent.data?.version ? `-${latestAgent.data.version}` : ""}.exe`}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
              title="ينزّل دائمًا أحدث إصدار منشور تلقائيًا"
            >
              <Download className="size-4" />
              تنزيل برنامج الموظف
              {latestAgent.data?.version ? ` (v${latestAgent.data.version})` : " (أحدث نسخة)"}
            </a>
            {latestAgent.data?.version && (
              <span className="text-[11px] text-muted-foreground">
                آخر إصدار: v{latestAgent.data.version}
                {latestAgent.data.notes ? ` — ${latestAgent.data.notes}` : ""}
              </span>
            )}
          </div>

          <Button onClick={() => setOpen(true)} className="gradient-primary text-white gap-1"><Plus className="size-4" />موظف جديد</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(q.data ?? []).map((u: any) => (
          <div key={u.user_id + u.role} className="card-surface rounded-2xl p-4">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <div className="relative size-14 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border">
                {u.avatar_signed_url ? (
                  <img src={u.avatar_signed_url} alt={u.full_name || u.email} className="size-full object-cover" />
                ) : (
                  <span className="text-lg font-bold text-muted-foreground">
                    {(u.full_name || u.email || "?").trim().charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="font-bold truncate">{u.full_name || u.email.split("@")[0]}</div>
                  <Badge variant={u.role === "admin" ? "default" : "secondary"} className="shrink-0">{u.role === "admin" ? "أدمن" : "موظف"}</Badge>
                </div>
                
                <div className="text-[10px] text-muted-foreground">مُضاف: {new Date(u.created_at).toLocaleDateString("ar-EG")}</div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 rounded-full"
                  onClick={() => setExpanded(u.user_id)}
                >
                  عرض كل البيانات
                </Button>
              </div>
            </div>
          </div>
        ))}
        {(q.data ?? []).length === 0 && <div className="card-surface rounded-2xl p-12 text-center text-muted-foreground col-span-full">لا يوجد موظفون</div>}
      </div>


      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>تعديل بيانات الموظف</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>الاسم الكامل</Label><Input value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} /></div>
              <div><Label>البريد الإلكتروني</Label><Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              <div><Label>كلمة سر جديدة (اختياري)</Label><Input type="password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} placeholder="اتركها فاضية لو مش عايز تغييرها" /></div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={saveEdit} disabled={savingEdit} className="gradient-primary text-white">
              {savingEdit ? <Loader2 className="size-4 animate-spin" /> : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>إضافة موظف جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>الاسم الكامل</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label>البريد الإلكتروني</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>كلمة السر (6+ أحرف)</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
              الموظف يقدر: يؤكد الطلبات ويرفضها، يدير المنتجات، يوافق على المراجعات.<br />
              الموظف لا يقدر: يعدل طرق الدفع، العملات، الإعدادات، أو يضيف موظفين.
            </div>
          </div>
          <DialogFooter><Button onClick={submit} className="gradient-primary text-white">إضافة</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ ORDERS ============
function OrdersTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const deleteAllFn = useServerFn(deleteAllOrders);
  const [deleting, setDeleting] = useState(false);
  const [filter, setFilter] = useState<string>("awaiting_confirmation");
  const [search, setSearch] = useState("");
  const ordersQ = useQuery({
    queryKey: ["admin-orders", filter, search],
    queryFn: async () => {
      let q = supabase.from("orders").select("*, items:order_items(*), payment_method:payment_methods(name)").order("created_at", { ascending: false });
      // when searching, ignore the status filter so results come from any tab
      if (!search.trim() && filter !== "all") q = q.eq("status", filter as any);
      return (await q).data ?? [];
    },
  });

  async function updateStatus(id: string, status: string) {
    const patch: any = { status };
    if (status === "confirmed") patch.confirmed_at = new Date().toISOString();
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("تم التحديث"); qc.invalidateQueries({ queryKey: ["admin-orders"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); }
  }

  const statusLabel: Record<string, string> = {
    pending_payment: "بانتظار الدفع",
    awaiting_confirmation: "الطلبات الجديد",
    confirmed: "قيد التنفيذ",
    completed: "مكتمل",
    rejected: "مرفوض",
    cancelled: "ملغى",
  };

  const rows = (ordersQ.data ?? []).filter((o: any) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return (
      (o.order_code ?? "").toLowerCase().includes(s) ||
      (o.customer_name ?? "").toLowerCase().includes(s) ||
      (o.customer_email ?? "").toLowerCase().includes(s) ||
      (o.customer_phone ?? "").includes(s)
    );
  });

  async function handleDeleteAll() {
    const total = ordersQ.data?.length ?? 0;
    if (!total) { toast.info("لا توجد طلبات لحذفها"); return; }
    if (!confirm(`سيتم حذف كل الطلبات (${total}) نهائياً. هل أنت متأكد؟`)) return;
    if (!confirm("تأكيد أخير: هذا الإجراء لا يمكن التراجع عنه.")) return;
    setDeleting(true);
    try {
      const res = await deleteAllFn();
      toast.success(`تم حذف ${res.deleted} طلب`);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (e: any) {
      toast.error(e?.message || "فشل الحذف");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold">الطلبات ({ordersQ.data?.length ?? 0})</h2>
          <p className="text-xs text-muted-foreground">إدارة ومتابعة حالة الطلبات</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="اكتب كود الطلب"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          {isAdmin && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteAll}
              disabled={deleting}
              className="gap-1"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              حذف كل الطلبات
            </Button>
          )}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {[["awaiting_confirmation","الطلبات الجديد"],["confirmed","قيد التنفيذ"],["completed","مكتمل"],["cancelled","ملغى"]].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-lg text-xs ${filter === k ? "gradient-primary text-white" : "card-surface"}`}>{l}</button>
        ))}
      </div>
      <div className="space-y-3">
        {rows.map((o: any) => (
          <div key={o.id} className="card-surface rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-bold text-primary">{o.order_code}</span>
                  <Badge variant={o.status === "confirmed" || o.status === "completed" ? "default" : o.status === "rejected" || o.status === "cancelled" ? "destructive" : "secondary"}>{statusLabel[o.status] ?? o.status}</Badge>
                </div>
                <div className="text-sm"><strong>{o.customer_name}</strong> · {o.customer_email}</div>
                <div className="text-xs text-muted-foreground">{o.dial_code}{o.customer_phone} · {o.customer_country} · {new Date(o.created_at).toLocaleString("ar-EG")}</div>
                <div className="mt-2 space-y-0.5 text-xs">
                  {(o.items ?? []).map((it: any) => <div key={it.id}>• {it.product_name} × {it.quantity} — {it.unit_price} {o.currency_code}</div>)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-black text-gradient">{o.total} {o.currency_code}</div>
                <div className="text-xs text-muted-foreground">{o.payment_method?.name}</div>
                {o.payment_screenshot && (
                  <button
                    type="button"
                    onClick={async () => {
                      const raw = o.payment_screenshot as string;
                      const path = raw.includes("payment-screenshots/")
                        ? raw.split("payment-screenshots/")[1]
                        : raw;
                      const { data, error } = await supabase.storage
                        .from("payment-screenshots")
                        .createSignedUrl(path, 300);
                      if (error || !data?.signedUrl) { toast.error("تعذر فتح الإثبات"); return; }
                      window.open(data.signedUrl, "_blank", "noopener");
                    }}
                    className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
                  ><ExternalLink className="size-3" />الإثبات</button>
                )}
              </div>
            </div>
            {o.status !== "completed" && o.status !== "cancelled" && o.status !== "rejected" && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                {o.status !== "confirmed" && (
                  <Button size="sm" onClick={() => updateStatus(o.id, "confirmed")} className="bg-blue-600 hover:bg-blue-700 text-white gap-1"><Check className="size-4" />استلام الطلب</Button>
                )}
                <Button size="sm" onClick={() => updateStatus(o.id, "completed")} className="bg-green-600 hover:bg-green-700 text-white gap-1"><Check className="size-4" />تأكيد الطلب (مكتمل)</Button>
                <Button size="sm" variant="destructive" onClick={() => { if (confirm("إلغاء الطلب؟")) updateStatus(o.id, "cancelled"); }} className="gap-1"><X className="size-4" />إلغاء الطلب</Button>
                {o.status === "awaiting_confirmation" && (
                  <Button size="sm" variant="outline" onClick={() => { if (confirm("رفض الطلب؟")) updateStatus(o.id, "rejected"); }} className="gap-1"><X className="size-4" />رفض</Button>
                )}
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="card-surface rounded-2xl p-12 text-center text-muted-foreground">لا توجد طلبات</div>}
      </div>
    </div>
  );
}

// ============ PRODUCTS ============
function ProductsTab() {
  const qc = useQueryClient();
  const productsQ = useQuery({ queryKey: ["admin-products"], queryFn: async () => (await supabase.from("products").select("*, category:categories(name,icon)").order("sort_order")).data ?? [] });
  const catsQ = useQuery({ queryKey: ["admin-cats"], queryFn: async () => (await supabase.from("categories").select("*").order("sort_order")).data ?? [] });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  function newProduct() { setEditing({ name: "", slug: "", description: "", short_description: "", base_price_egp: 0, discount_percent: 0, warranty_days: 30, category_id: catsQ.data?.[0]?.id, active: true, featured: false, sort_order: 0 }); setOpen(true); }
  function edit(p: any) { setEditing({ ...p }); setOpen(true); }
  async function del(id: string) {
    if (!confirm("حذف المنتج؟")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["admin-products"] }); }
  }
  async function save() {
    if (!editing.name || !editing.slug) { toast.error("الاسم والرابط مطلوبان"); return; }
    const payload = { ...editing };
    delete payload.category;
    const op = payload.id ? supabase.from("products").update(payload).eq("id", payload.id) : supabase.from("products").insert(payload);
    const { error } = await op;
    if (error) toast.error(error.message);
    else { toast.success("تم الحفظ"); setOpen(false); qc.invalidateQueries({ queryKey: ["admin-products"] }); }
  }
  async function uploadImage(file: File) {
    const path = `products/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file);
    if (error) { toast.error(error.message); return; }
    const { data, error: sErr } = await supabase.storage.from("product-images").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (sErr || !data?.signedUrl) { toast.error(sErr?.message || "فشل إنشاء الرابط"); return; }
    setEditing({ ...editing, main_image: data.signedUrl });
    toast.success("تم رفع الصورة");
  }

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-xl font-bold">المنتجات ({productsQ.data?.length ?? 0})</h2>
        <Button onClick={newProduct} className="gradient-primary text-white gap-1"><Plus className="size-4" />منتج جديد</Button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(productsQ.data ?? []).map((p: any) => (
          <div key={p.id} className="card-surface rounded-2xl p-4">
            <div className="aspect-video bg-primary/10 rounded-lg overflow-hidden mb-3">
              {p.main_image ? <img src={p.main_image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-4xl opacity-40">{p.category?.icon ?? "🎁"}</div>}
            </div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-sm">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.base_price_egp} ج.م {p.discount_percent > 0 && `- ${p.discount_percent}%`}</div>
                {!p.active && <Badge variant="destructive" className="mt-1 text-[10px]">مخفي</Badge>}
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => edit(p)}><Edit className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => del(p.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "تعديل" : "منتج جديد"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>الاسم</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value, slug: editing.slug || e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^\w\-]/g, "") })} /></div>
                <div><Label>الرابط (slug)</Label><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} /></div>
              </div>
              <div><Label>وصف قصير</Label><Input value={editing.short_description ?? ""} onChange={(e) => setEditing({ ...editing, short_description: e.target.value })} /></div>
              <div><Label>الوصف الكامل</Label><Textarea rows={4} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>السعر (ج.م)</Label><Input type="number" value={editing.base_price_egp} onChange={(e) => setEditing({ ...editing, base_price_egp: Number(e.target.value) })} /></div>
                <div><Label>خصم %</Label><Input type="number" value={editing.discount_percent} onChange={(e) => setEditing({ ...editing, discount_percent: Number(e.target.value) })} /></div>
                <div><Label>ضمان (يوم)</Label><Input type="number" value={editing.warranty_days} onChange={(e) => setEditing({ ...editing, warranty_days: Number(e.target.value) })} /></div>
              </div>
              <div><Label>نهاية الخصم</Label><Input type="datetime-local" value={editing.discount_ends_at?.slice(0,16) ?? ""} onChange={(e) => setEditing({ ...editing, discount_ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div>
              <div><Label>القسم</Label>
                <select value={editing.category_id ?? ""} onChange={(e) => setEditing({ ...editing, category_id: e.target.value })} className="w-full h-10 rounded-md border border-input bg-input px-3 text-sm">
                  <option value="">— بدون —</option>
                  {(catsQ.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <div><Label>صورة المنتج</Label>
                {editing.main_image && <img src={editing.main_image} alt="" className="w-32 h-32 object-cover rounded-lg mb-2" />}
                <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> نشط</label>
                <label className="flex items-center gap-2"><Switch checked={editing.featured} onCheckedChange={(v) => setEditing({ ...editing, featured: v })} /> مميز</label>
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={save} className="gradient-primary text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ CATEGORIES ============
function CategoriesTab() {
  const qc = useQueryClient();
  const catsQ = useQuery({ queryKey: ["admin-categories"], queryFn: async () => (await supabase.from("categories").select("*").order("sort_order")).data ?? [] });
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  async function save() {
    if (!editing.name || !editing.slug) return toast.error("الاسم والرابط مطلوبان");
    const payload: any = {
      name: editing.name, slug: editing.slug, icon: editing.icon,
      banner_image: editing.banner_image ?? null,
      sort_order: editing.sort_order, active: editing.active,
    };
    const op = editing.id
      ? supabase.from("categories").update(payload).eq("id", editing.id)
      : supabase.from("categories").insert(payload);
    const { error } = await op;
    if (error) toast.error(error.message); else { toast.success("محفوظ"); setOpen(false); qc.invalidateQueries({ queryKey: ["admin-categories"] }); }
  }
  async function del(id: string) { if (!confirm("حذف؟")) return; await supabase.from("categories").delete().eq("id", id); qc.invalidateQueries({ queryKey: ["admin-categories"] }); }
  async function uploadCategoryBanner(file: File) {
    const path = `categories/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file);
    if (error) { toast.error(error.message); return; }
    const { data, error: sErr } = await supabase.storage.from("product-images").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (sErr || !data?.signedUrl) { toast.error(sErr?.message || "فشل إنشاء الرابط"); return; }
    setEditing({ ...editing, banner_image: data.signedUrl });
    toast.success("تم رفع صورة البانر");
  }

  return (
    <div>
      <div className="flex justify-between mb-6">
        <h2 className="text-xl font-bold">الأقسام</h2>
        <Button onClick={() => { setEditing({ name: "", slug: "", icon: "🎁", banner_image: null, sort_order: 0, active: true }); setOpen(true); }} className="gradient-primary text-white gap-1"><Plus className="size-4" />قسم جديد</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
        {(catsQ.data ?? []).map((c: any) => {
          const label = c.name || "قسم";
          const initial = label.trim().charAt(0);
          return (
            <div key={c.id} className="bg-card border border-border/60 rounded-2xl p-4 flex flex-col items-center text-center gap-3 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all">
              <div className="relative">
                <div className="size-20 rounded-full gradient-primary ring-4 ring-background flex items-center justify-center text-2xl font-black text-white shadow-xl">
                  {initial}
                </div>
                <div className="absolute bottom-0 right-0 size-6 rounded-full bg-primary flex items-center justify-center ring-2 ring-background">
                  <span className="text-[10px] text-white">{c.icon}</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground">/{c.slug}</div>
              </div>
              <div className="flex gap-1.5 w-full justify-center">
                <Button size="sm" variant="outline" className="rounded-full flex-1" onClick={() => { setEditing(c); setOpen(true); }}><Edit className="size-4" />تعديل</Button>
                <Button size="sm" variant="outline" className="rounded-full text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => del(c.id)}><Trash2 className="size-4" />حذف</Button>
              </div>
            </div>
          );
        })}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>قسم</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>الاسم</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>الرابط</Label><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} /></div>
              <div>
                <Label>صورة القسم</Label>
                {editing.banner_image && (
                  <div className="flex items-center gap-2 my-2">
                    <img src={editing.banner_image} alt="" className="size-20 rounded-lg object-cover" />
                    <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, banner_image: null })}>حذف الصورة</Button>
                  </div>
                )}
                <input
                  id="cat-banner-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadCategoryBanner(e.target.files[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 gap-2 w-full"
                  onClick={() => document.getElementById("cat-banner-input")?.click()}
                >
                  <Plus className="size-4" />
                  {editing.banner_image ? "تغيير الصورة" : "تحميل صورة"}
                </Button>
              </div>

              <div><Label>الترتيب</Label><Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} /></div>
              <label className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> نشط</label>
            </div>
          )}
          <DialogFooter><Button onClick={save} className="gradient-primary text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ PAYMENT METHODS ============
function PaymentsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-pm"], queryFn: async () => (await supabase.from("payment_methods").select("*").order("sort_order")).data ?? [] });
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  async function save() {
    const op = editing.id ? supabase.from("payment_methods").update({ ...editing, id: undefined }).eq("id", editing.id) : supabase.from("payment_methods").insert(editing);
    const { error } = await op;
    if (error) toast.error(error.message); else { toast.success("محفوظ"); setOpen(false); qc.invalidateQueries({ queryKey: ["admin-pm"] }); }
  }
  async function del(id: string) { if (!confirm("حذف؟")) return; await supabase.from("payment_methods").delete().eq("id", id); qc.invalidateQueries({ queryKey: ["admin-pm"] }); }

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-xl font-bold">طرق الدفع</h2>
        <Button onClick={() => { setEditing({ name: "", type: "", account_number: "", active: true, sort_order: 0 }); setOpen(true); }} className="gradient-primary text-white gap-1"><Plus className="size-4" />جديد</Button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {(q.data ?? []).map((p: any) => (
          <div key={p.id} className="card-surface rounded-2xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.type} {p.country_code && `· ${p.country_code}`}</div>
                <div className="font-mono text-sm mt-1">{p.account_number}</div>
                {p.account_name && <div className="text-xs text-muted-foreground">{p.account_name}</div>}
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}><Edit className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => del(p.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>طريقة دفع</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>الاسم</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>النوع</Label><Input value={editing.type ?? ""} onChange={(e) => setEditing({ ...editing, type: e.target.value })} placeholder="vodafone_cash / instapay / binance ..." /></div>
              <div><Label>الدولة (اختياري)</Label><Input value={editing.country_code ?? ""} onChange={(e) => setEditing({ ...editing, country_code: e.target.value || null })} placeholder="EG / SA / null" /></div>
              <div><Label>رقم الحساب</Label><Input value={editing.account_number ?? ""} onChange={(e) => setEditing({ ...editing, account_number: e.target.value })} /></div>
              <div><Label>اسم الحساب</Label><Input value={editing.account_name ?? ""} onChange={(e) => setEditing({ ...editing, account_name: e.target.value })} /></div>
              <div><Label>تعليمات</Label><Textarea value={editing.instructions ?? ""} onChange={(e) => setEditing({ ...editing, instructions: e.target.value })} /></div>
              <label className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> نشط</label>
            </div>
          )}
          <DialogFooter><Button onClick={save} className="gradient-primary text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ CURRENCIES / FX ============
function CurrenciesTab() {
  const qc = useQueryClient();
  const currsQ = useQuery({ queryKey: ["admin-currencies"], queryFn: async () => (await supabase.from("currencies").select("*").order("code")).data ?? [] });
  const ratesQ = useQuery({ queryKey: ["admin-rates"], queryFn: async () => (await supabase.from("exchange_rates").select("*, currency:currencies(name,symbol)")).data ?? [] });
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => { if (ratesQ.data) { const v: any = {}; ratesQ.data.forEach((r: any) => v[r.currency_code] = String(r.rate_from_egp)); setValues(v); } }, [ratesQ.data]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  async function saveAll() {
    for (const [code, val] of Object.entries(values)) {
      await supabase.from("exchange_rates").update({ rate_from_egp: Number(val), updated_at: new Date().toISOString() }).eq("currency_code", code);
    }
    toast.success("تم تحديث الأسعار");
    qc.invalidateQueries({ queryKey: ["admin-rates"] });
  }

  async function saveCurrency() {
    if (!editing.code || !editing.name || !editing.symbol) return toast.error("أكمل البيانات");
    const code = editing.code.toUpperCase();
    const isNew = !editing._original_code;
    if (isNew) {
      const { error } = await supabase.from("currencies").insert({ code, name: editing.name, symbol: editing.symbol, active: editing.active ?? true });
      if (error) return toast.error(error.message);
      await supabase.from("exchange_rates").insert({ currency_code: code, rate_from_egp: Number(editing.rate_from_egp) || 1 });
    } else {
      const { error } = await supabase.from("currencies").update({ name: editing.name, symbol: editing.symbol, active: editing.active }).eq("code", editing._original_code);
      if (error) return toast.error(error.message);
      if (editing.rate_from_egp != null) {
        await supabase.from("exchange_rates").update({ rate_from_egp: Number(editing.rate_from_egp), updated_at: new Date().toISOString() }).eq("currency_code", editing._original_code);
      }
    }
    toast.success("تم الحفظ");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-currencies"] });
    qc.invalidateQueries({ queryKey: ["admin-rates"] });
  }
  async function delCurrency(code: string) {
    if (!confirm(`حذف العملة ${code}؟`)) return;
    await supabase.from("exchange_rates").delete().eq("currency_code", code);
    const { error } = await supabase.from("currencies").delete().eq("code", code);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["admin-currencies"] });
    qc.invalidateQueries({ queryKey: ["admin-rates"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold">العملات</h2>
            <p className="text-xs text-muted-foreground">إضافة / تعديل / حذف العملات المدعومة</p>
          </div>
          <Button onClick={() => { setEditing({ code: "", name: "", symbol: "", rate_from_egp: 1, active: true }); setOpen(true); }} className="gradient-primary text-white gap-1"><Plus className="size-4" />عملة جديدة</Button>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {(currsQ.data ?? []).map((c: any) => (
            <div key={c.code} className="card-surface rounded-2xl p-4 flex items-center justify-between">
              <div>
                <div className="font-bold">{c.name} <span className="text-xs text-muted-foreground">({c.code})</span></div>
                <div className="text-xs text-muted-foreground">الرمز: {c.symbol} {!c.active && "· متوقف"}</div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => {
                  const r = ratesQ.data?.find((x: any) => x.currency_code === c.code);
                  setEditing({ ...c, _original_code: c.code, rate_from_egp: r?.rate_from_egp ?? 1 });
                  setOpen(true);
                }}><Edit className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => delCurrency(c.code)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold mb-2">أسعار الصرف (من الجنيه المصري)</h2>
        <p className="text-xs text-muted-foreground mb-4">مثال: 1 ج.م = 0.021 USD يعني تسعير الدولار = السعر بالجنيه × 0.021</p>
        <div className="grid md:grid-cols-2 gap-3">
          {(ratesQ.data ?? []).map((r: any) => (
            <div key={r.currency_code} className="card-surface rounded-2xl p-4">
              <Label>{r.currency?.name} ({r.currency_code}) {r.currency?.symbol}</Label>
              <Input type="number" step="any" value={values[r.currency_code] ?? ""} onChange={(e) => setValues({ ...values, [r.currency_code]: e.target.value })} />
            </div>
          ))}
        </div>
        <Button onClick={saveAll} className="gradient-primary text-white mt-4">حفظ الكل</Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?._original_code ? "تعديل عملة" : "عملة جديدة"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>الكود (مثل USD)</Label><Input value={editing.code ?? ""} disabled={!!editing._original_code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} maxLength={5} /></div>
              <div><Label>الاسم</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>الرمز</Label><Input value={editing.symbol ?? ""} onChange={(e) => setEditing({ ...editing, symbol: e.target.value })} placeholder="$ / ر.س / ج.م" /></div>
              <div><Label>سعر الصرف (1 ج.م = ؟ من هذه العملة)</Label><Input type="number" step="any" value={editing.rate_from_egp ?? ""} onChange={(e) => setEditing({ ...editing, rate_from_egp: e.target.value })} /></div>
              <label className="flex items-center gap-2"><Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> نشط</label>
            </div>
          )}
          <DialogFooter><Button onClick={saveCurrency} className="gradient-primary text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ TIMERS ============
function TimersTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-timers"], queryFn: async () => (await supabase.from("countdown_timers").select("*").order("created_at", { ascending: false })).data ?? [] });
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  async function save() {
    const op = editing.id ? supabase.from("countdown_timers").update({ ...editing, id: undefined }).eq("id", editing.id) : supabase.from("countdown_timers").insert(editing);
    const { error } = await op;
    if (error) toast.error(error.message); else { toast.success("محفوظ"); setOpen(false); qc.invalidateQueries({ queryKey: ["admin-timers"] }); }
  }
  async function del(id: string) { await supabase.from("countdown_timers").delete().eq("id", id); qc.invalidateQueries({ queryKey: ["admin-timers"] }); }

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-xl font-bold">مؤقتات العروض</h2>
        <Button onClick={() => { setEditing({ title: "", subtitle: "", ends_at: new Date(Date.now() + 86400000).toISOString(), active: true }); setOpen(true); }} className="gradient-primary text-white gap-1"><Plus className="size-4" />جديد</Button>
      </div>
      <div className="space-y-3">
        {(q.data ?? []).map((t: any) => (
          <div key={t.id} className="card-surface rounded-2xl p-4 flex items-center justify-between">
            <div><div className="font-bold">{t.title}</div><div className="text-xs text-muted-foreground">{new Date(t.ends_at).toLocaleString("ar-EG")}</div></div>
            <div className="flex gap-1">
              {t.active ? <Badge>نشط</Badge> : <Badge variant="secondary">متوقف</Badge>}
              <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}><Edit className="size-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => del(t.id)}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>مؤقت عرض</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>العنوان</Label><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div><Label>وصف</Label><Input value={editing.subtitle ?? ""} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} /></div>
              <div><Label>ينتهي في</Label><Input type="datetime-local" value={editing.ends_at?.slice(0,16) ?? ""} onChange={(e) => setEditing({ ...editing, ends_at: new Date(e.target.value).toISOString() })} /></div>
              <label className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> نشط</label>
            </div>
          )}
          <DialogFooter><Button onClick={save} className="gradient-primary text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ SETTINGS ============
function SettingsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: async () => (await supabase.from("site_settings").select("*")).data ?? [] });
  const [site, setSite] = useState<any>({});
  const [banner, setBanner] = useState<any>({ enabled: true, title: "", subtitle: "" });
  useEffect(() => {
    const s = q.data?.find((x: any) => x.key === "site"); if (s) setSite(s.value);
    const b = q.data?.find((x: any) => x.key === "checkout_banner"); if (b) setBanner(b.value);
  }, [q.data]);

  async function save() {
    const { error } = await supabase.from("site_settings").update({ value: site, updated_at: new Date().toISOString() }).eq("key", "site");
    if (error) toast.error(error.message); else toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  async function saveBanner() {
    const { error } = await supabase.from("site_settings").upsert({ key: "checkout_banner", value: banner, updated_at: new Date().toISOString() });
    if (error) toast.error(error.message); else toast.success("تم حفظ البانر");
    qc.invalidateQueries({ queryKey: ["settings"] });
    qc.invalidateQueries({ queryKey: ["checkout-banner"] });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-4">إعدادات الموقع</h2>
        <div className="card-surface rounded-2xl p-6 space-y-3">
        <div><Label>اسم الموقع</Label><Input value={site.name ?? ""} onChange={(e) => setSite({ ...site, name: e.target.value })} /></div>
        <div><Label>الوصف</Label><Input value={site.tagline ?? ""} onChange={(e) => setSite({ ...site, tagline: e.target.value })} /></div>
        <div><Label>رقم WhatsApp</Label><Input value={site.whatsapp ?? ""} onChange={(e) => setSite({ ...site, whatsapp: e.target.value })} /></div>
        <div><Label>البريد الإلكتروني</Label><Input value={site.email ?? ""} onChange={(e) => setSite({ ...site, email: e.target.value })} /></div>
        <div><Label>نص الفوتر</Label><Input value={site.footer_text ?? ""} onChange={(e) => setSite({ ...site, footer_text: e.target.value })} /></div>
        <Button onClick={save} className="gradient-primary text-white">حفظ</Button>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">بانر صفحة الشراء</h2>
        <p className="text-xs text-muted-foreground mb-3">يظهر أعلى صفحة إتمام الشراء لجذب العميل وطمأنته.</p>
        <div className="card-surface rounded-2xl p-6 space-y-3">
          <label className="flex items-center gap-2">
            <Switch checked={!!banner.enabled} onCheckedChange={(v) => setBanner({ ...banner, enabled: v })} />
            تفعيل البانر
          </label>
          <div><Label>العنوان الرئيسي</Label><Input value={banner.title ?? ""} onChange={(e) => setBanner({ ...banner, title: e.target.value })} placeholder="🎉 اطلب الآن واستلم خلال دقائق" /></div>
          <div><Label>النص الفرعي</Label><Textarea rows={2} value={banner.subtitle ?? ""} onChange={(e) => setBanner({ ...banner, subtitle: e.target.value })} placeholder="ضمان استرداد كامل • دعم مباشر • تفعيل فوري" /></div>
          <Button onClick={saveBanner} className="gradient-primary text-white">حفظ البانر</Button>
        </div>
      </div>
    </div>
  );
}

// ============ COURSES ============
function CoursesTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const checkFn = useServerFn(checkDevice);
  const identityFn = useServerFn(getViewerIdentity);
  const [deviceState, setDeviceState] = useState<"checking" | "ok" | "blocked">(isAdmin ? "ok" : "checking");
  const [myFp, setMyFp] = useState<string>("");
  const [viewer, setViewer] = useState<{ email: string; full_name: string; avatar_url: string } | null>(null);
  useEffect(() => {
    (async () => {
      try {
        if (isAdmin) return;
        identityFn().then(setViewer).catch(() => {});
        const { ensureDeviceChecked } = await import("@/lib/device-session");
        const { ok, fingerprint } = await ensureDeviceChecked(checkFn as any);
        setMyFp(fingerprint);
        setDeviceState(ok ? "ok" : "blocked");
      } catch { setDeviceState("blocked"); }
    })();
  }, [isAdmin, checkFn, identityFn]);
  const courses = useQuery({
    queryKey: ["admin-courses"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*, course_lessons(id,duration_sec)").order("sort_order").order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: deviceState === "ok",
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ title: "", description: "", cover_url: "", sort_order: 0, is_published: true });
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);

  function startNew() { setEditing(null); setForm({ title: "", description: "", cover_url: "", sort_order: 0, is_published: true }); setOpen(true); }
  function startEdit(c: any) { setEditing(c); setForm({ title: c.title, description: c.description ?? "", cover_url: c.cover_url ?? "", sort_order: c.sort_order, is_published: c.is_published }); setOpen(true); }

  async function save() {
    if (!form.title.trim()) { toast.error("العنوان مطلوب"); return; }
    const payload = { ...form, description: form.description || null, cover_url: form.cover_url || null };
    if (editing) {
      const { error } = await supabase.from("courses").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("courses").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("تم الحفظ");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-courses"] });
  }
  async function remove(c: any) {
    if (!confirm(`حذف الكورس "${c.title}"؟`)) return;
    const { error } = await supabase.from("courses").delete().eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["admin-courses"] });
  }

  if (deviceState === "checking") return (
    <div className="flex items-center justify-center py-20"><Loader2 className="size-8 animate-spin text-primary" /></div>
  );
  if (deviceState === "blocked") return (
    <div className="flex items-center justify-center py-10" dir="rtl">
      <div className="card-surface rounded-2xl p-8 max-w-md text-center space-y-3">
        <ShieldAlert className="size-14 mx-auto text-destructive" />
        <h1 className="text-xl font-bold">محتوى محمي</h1>
        <p className="text-sm text-muted-foreground">هذا الجهاز غير مسجّل. أرسل معرّف الجهاز التالي للإدارة لتفعيله:</p>
        <div className="p-2 rounded-xl bg-muted/50 font-mono text-[10px] break-all select-all">{myFp}</div>
        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(myFp); toast.success("تم نسخ المعرّف"); }}>نسخ المعرّف</Button>
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className={isAdmin ? "flex justify-end" : "flex justify-center"}>
        {isAdmin ? (
          <Button onClick={startNew} className="gradient-primary text-primary-foreground shrink-0"><Plus className="size-4 ml-1" />كورس جديد</Button>
        ) : (
          <div className="flex flex-col items-center text-center gap-3">
            <div className="relative shrink-0">
              <div className="size-20 md:size-24 rounded-full gradient-primary ring-4 ring-background flex items-center justify-center overflow-hidden shadow-lg">
                {viewer?.avatar_url ? (
                  <img src={viewer.avatar_url} alt={viewer?.full_name || "avatar"} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl md:text-3xl font-black text-primary-foreground">{((viewer?.full_name || viewer?.email || "?")[0] || "?").toUpperCase()}</span>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <h2 className="text-xl md:text-2xl font-black">
                <span className="text-muted-foreground">موظف :</span>{' '}
                <span className="text-gradient">{viewer?.full_name || viewer?.email?.split("@")[0] || "—"}</span>
              </h2>
              <p className="text-xs text-muted-foreground">محتوى محمي — الفيديوهات تُعرض فقط للأجهزة المسجّلة.</p>
            </div>
          </div>
        )}
      </div>

      {courses.isLoading ? <Loader2 className="animate-spin mx-auto" /> :
        !courses.data?.length ? <div className="card-surface p-8 text-center text-muted-foreground rounded-2xl">لا توجد كورسات بعد</div> :
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
          {courses.data.map((c: any) => {
            const lessonsArr = (c.course_lessons ?? []) as Array<{ id: string; duration_sec: number | null }>;
            const count = lessonsArr.length;
            const totalSec = lessonsArr.reduce((s, l) => s + (l.duration_sec ?? 0), 0);
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const s = Math.floor(totalSec % 60);
            const dur = totalSec ? (h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`) : "0:00";
            const prefetchCourse = () => {
              qc.prefetchQuery({
                queryKey: ["course", c.id],
                queryFn: async () => (await supabase.from("courses").select("*").eq("id", c.id).maybeSingle()).data,
                staleTime: 5 * 60_000,
              });
              qc.prefetchQuery({
                queryKey: ["course-lessons", c.id],
                queryFn: async () => (await supabase.from("course_lessons").select("*").eq("course_id", c.id).order("sort_order")).data ?? [],
                staleTime: 5 * 60_000,
              });
            };
            return (
              <div key={c.id}
                onMouseEnter={prefetchCourse}
                onTouchStart={prefetchCourse}
                className="bg-card border border-border/60 rounded-2xl overflow-hidden flex flex-col p-2 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all">
                <Link to="/courses/$id" params={{ id: c.id }} className="block group">
                  <div className="relative aspect-[16/10] bg-black overflow-hidden rounded-xl">
                    {c.cover_url ? (
                      <img src={c.cover_url} alt={c.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    ) : (
                      <div className="w-full h-full gradient-primary flex items-center justify-center"><PlayCircle className="size-12 text-white/70" /></div>
                    )}
                    {!c.is_published && <Badge variant="outline" className="absolute top-2 right-2 bg-background/80 backdrop-blur">مسودة</Badge>}
                  </div>
                </Link>
                <div className="px-2 pt-3 pb-2 flex flex-col gap-3 flex-1">
                  <h3 className="text-sm md:text-base font-bold line-clamp-2 text-center leading-snug">{c.title}</h3>
                  <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                    <span className="inline-flex items-center gap-1.5">
                      <span>{count} محاضرة</span>
                      <PlayCircle className="size-3.5" />
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span>{dur}</span>
                      <Clock className="size-3.5" />
                    </span>
                  </div>
                  <div className="mt-auto pt-1 space-y-2">
                    <Link to="/courses/$id" params={{ id: c.id }} className="block">
                      <Button variant="outline" size="sm" className="w-full rounded-full h-10 text-primary border-primary/50 hover:bg-primary hover:text-primary-foreground font-bold">
                        دخول
                      </Button>
                    </Link>
                    {isAdmin && (
                      <div className="flex gap-1.5 flex-wrap justify-center">
                       <LessonsManager courseId={c.id} courseTitle={c.title} />
                        <Button size="sm" variant="outline" onClick={() => startEdit(c)}><Edit className="size-4" /></Button>
                        <Button size="sm" variant="outline" onClick={() => remove(c)}><Trash2 className="size-4 text-destructive" /></Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      }

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "تعديل كورس" : "كورس جديد"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>العنوان</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>الوصف</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>صورة الغلاف</Label>
              <div className="flex items-center gap-3">
                <div className="w-40 h-24 shrink-0 rounded-xl overflow-hidden border border-border/60 bg-muted/30 flex items-center justify-center">
                  {form.cover_url ? (
                    <img src={form.cover_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setCoverUploading(true);
                      try {
                        const ext = file.name.split(".").pop();
                        const path = `courses/${crypto.randomUUID()}.${ext}`;
                        const { error } = await supabase.storage.from("product-images").upload(path, file);
                        if (error) throw error;
                        const { data: signed, error: sErr } = await supabase.storage.from("product-images").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
                        if (sErr || !signed?.signedUrl) throw new Error(sErr?.message || "فشل توليد الرابط");
                        setForm((f: any) => ({ ...f, cover_url: signed.signedUrl }));
                        toast.success("تم رفع الصورة");
                      } catch (err: any) {
                        toast.error(err?.message ?? "فشل رفع الصورة");
                      } finally {
                        setCoverUploading(false);
                        if (coverInputRef.current) coverInputRef.current.value = "";
                      }
                    }}
                  />
                  <Button type="button" variant="outline" className="w-full" disabled={coverUploading} onClick={() => coverInputRef.current?.click()}>
                    {coverUploading ? <Loader2 className="size-4 animate-spin ml-1" /> : <Upload className="size-4 ml-1" />}
                    تحميل صورة
                  </Button>
                  {form.cover_url && (
                    <Button type="button" variant="ghost" size="sm" className="w-full text-destructive" onClick={() => setForm({ ...form, cover_url: "" })}>
                      <X className="size-3.5 ml-1" />إزالة الصورة
                    </Button>
                  )}
                  <p className="text-[10px] text-muted-foreground">المقاس المفضّل 1280×800 (16:10)</p>
                </div>
              </div>
            </div>
            <div><Label>الترتيب</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
            <label className="flex items-center gap-2"><Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} />منشور</label>
          </div>
          <DialogFooter><Button onClick={save} className="gradient-primary text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LessonsManager({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  return <LessonsManagerInner courseId={courseId} courseTitle={courseTitle} />;
}

function probeVideoDurationFromUrl(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (val: number | null) => { v.src = ""; resolve(val); };
    v.onloadedmetadata = () => {
      const d = v.duration;
      done(isFinite(d) && d > 0 ? Math.round(d) : null);
    };
    v.onerror = () => done(null);
    v.src = url;
    setTimeout(() => done(null), 15000);
  });
}

function probeVideoDurationFromFile(file: File): Promise<number | null> {
  const url = URL.createObjectURL(file);
  return probeVideoDurationFromUrl(url).finally(() => URL.revokeObjectURL(url)) as Promise<number | null>;
}

function LessonsManagerInner({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const lessons = useQuery({
    queryKey: ["admin-lessons", courseId],
    queryFn: async () => {
      const { data } = await supabase.from("course_lessons").select("*").eq("course_id", courseId).order("sort_order");
      return data ?? [];
    },
    enabled: open,
  });
  // Backfill missing durations for existing lessons
  useEffect(() => {
    if (!open || !lessons.data) return;
    const missing = lessons.data.filter((l: any) => !l.duration_sec && l.video_path);
    if (!missing.length) return;
    (async () => {
      let updated = false;
      for (const l of missing) {
        try {
          const { data: signed } = await supabase.storage.from("course-videos").createSignedUrl(l.video_path, 300);
          if (!signed?.signedUrl) continue;
          const dur = await probeVideoDurationFromUrl(signed.signedUrl);
          if (!dur) continue;
          await supabase.from("course_lessons").update({ duration_sec: dur }).eq("id", l.id);
          updated = true;
        } catch { /* ignore */ }
      }
      if (updated) {
        qc.invalidateQueries({ queryKey: ["admin-lessons", courseId] });
        qc.invalidateQueries({ queryKey: ["admin-courses"] });
      }
    })();
  }, [open, lessons.data, courseId, qc]);


  async function removeLesson(l: any) {
    if (!confirm("حذف المحاضرة؟")) return;
    await supabase.storage.from("course-videos").remove([l.video_path]);
    await supabase.from("course_lessons").delete().eq("id", l.id);
    qc.invalidateQueries({ queryKey: ["admin-lessons", courseId] });
  }

  async function moveLesson(index: number, dir: -1 | 1) {
    const arr = (lessons.data ?? []) as any[];
    const target = index + dir;
    if (target < 0 || target >= arr.length) return;
    const a = arr[index];
    const b = arr[target];
    const { error } = await supabase.from("course_lessons").upsert([
      { id: a.id, course_id: courseId, title: a.title, video_path: a.video_path, sort_order: target },
      { id: b.id, course_id: courseId, title: b.title, video_path: b.video_path, sort_order: index },
    ]);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["admin-lessons", courseId] });
  }

  async function updateLesson(id: string, patch: { title?: string; sort_order?: number }) {
    const { error } = await supabase.from("course_lessons").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["admin-lessons", courseId] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Upload className="size-4 ml-1" />محاضرات</Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>محاضرات: {courseTitle}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {(() => {
            const arr = (lessons.data ?? []) as Array<{ duration_sec: number | null }>;
            const totalSec = arr.reduce((s, l) => s + (l.duration_sec ?? 0), 0);
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const sec = Math.floor(totalSec % 60);
            const hoursText = h > 0 ? `${h} ساعة و${m} دقيقة` : m > 0 ? `${m} دقيقة و${sec} ثانية` : `${sec} ثانية`;
            return (
              <div className="grid grid-cols-2 gap-2">
                <div className="card-surface rounded-xl p-3 text-center">
                  <div className="text-[11px] text-muted-foreground">عدد المحاضرات</div>
                  <div className="text-lg font-bold tabular-nums">{arr.length}</div>
                </div>
                <div className="card-surface rounded-xl p-3 text-center">
                  <div className="text-[11px] text-muted-foreground">إجمالي المدة</div>
                  <div className="text-lg font-bold tabular-nums">{hoursText}</div>
                </div>
              </div>
            );
          })()}

          <div className="card-surface rounded-xl p-3 space-y-2">
            <div className="text-sm font-semibold">إضافة محاضرات جديدة</div>
            <LessonUploader
              courseId={courseId}
              startOrder={lessons.data?.length ?? 0}
              onUploaded={() => {
                qc.invalidateQueries({ queryKey: ["admin-lessons", courseId] });
                qc.invalidateQueries({ queryKey: ["admin-courses"] });
              }}
            />
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {lessons.data?.map((l: any, idx: number) => (
              <LessonRow
                key={l.id}
                lesson={l}
                index={idx}
                total={lessons.data.length}
                onSave={updateLesson}
                onMove={(dir) => moveLesson(idx, dir)}
                onDelete={() => removeLesson(l)}
              />
            ))}
            {!lessons.data?.length && <div className="text-center text-xs text-muted-foreground p-4">لا توجد محاضرات</div>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LessonRow({
  lesson,
  index,
  total,
  onSave,
  onMove,
  onDelete,
}: {
  lesson: any;
  index: number;
  total: number;
  onSave: (id: string, patch: { title?: string; sort_order?: number }) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(lesson.title ?? "");
  useEffect(() => { setTitle(lesson.title ?? ""); }, [lesson.title]);
  const dirty = title !== (lesson.title ?? "");
  return (
    <div className="flex items-center gap-2 p-2 rounded-xl border border-border/40">
      <span className="w-6 text-center text-xs text-muted-foreground tabular-nums">{index + 1}</span>
      <div className="flex flex-col gap-0.5">
        <Button size="icon" variant="ghost" className="size-6" disabled={index === 0} onClick={() => onMove(-1)} title="تحريك لأعلى">
          <ChevronUp className="size-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="size-6" disabled={index === total - 1} onClick={() => onMove(1)} title="تحريك لأسفل">
          <ChevronDown className="size-3.5" />
        </Button>
      </div>
      <Input className="flex-1 h-9" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اسم المحاضرة" />
      <Button size="sm" variant="outline" disabled={!dirty || !title.trim()} onClick={() => onSave(lesson.id, { title: title.trim() })}>حفظ</Button>
      <Button size="sm" variant="outline" onClick={onDelete}><Trash2 className="size-4 text-destructive" /></Button>
    </div>
  );
}


function CourseAccessManager({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState("");
  const listAccessFn = useServerFn(adminListCourseAccess);
  const listEmpFn = useServerFn(adminListEmployees);
  const grantFn = useServerFn(adminGrantCourseAccess);
  const revokeFn = useServerFn(adminRevokeCourseAccess);

  const accessQ = useQuery({
    queryKey: ["course-access", courseId],
    queryFn: () => listAccessFn({ data: { course_id: courseId } }) as Promise<any[]>,
    enabled: open,
  });
  const empQ = useQuery({
    queryKey: ["admin-employees-for-access"],
    queryFn: () => listEmpFn() as Promise<any[]>,
    enabled: open,
  });

  const grantedIds = new Set((accessQ.data ?? []).map((a: any) => a.user_id));
  const available = (empQ.data ?? []).filter((e: any) => !grantedIds.has(e.id));

  async function grant() {
    if (!selectedUser) { toast.error("اختر موظف"); return; }
    try {
      await grantFn({ data: { course_id: courseId, user_id: selectedUser } });
      toast.success("تم منح الصلاحية");
      setSelectedUser("");
      qc.invalidateQueries({ queryKey: ["course-access", courseId] });
    } catch (e: any) { toast.error(e.message ?? "فشل"); }
  }
  async function revoke(id: string) {
    if (!confirm("إزالة الصلاحية؟")) return;
    try {
      await revokeFn({ data: { access_id: id } });
      toast.success("تمت الإزالة");
      qc.invalidateQueries({ queryKey: ["course-access", courseId] });
    } catch (e: any) { toast.error(e.message ?? "فشل"); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Lock className="size-4 ml-1" />صلاحيات</Button>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>صلاحيات الوصول: {courseTitle}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="card-surface rounded-xl p-3 space-y-2">
            <div className="text-sm font-semibold">إضافة موظف</div>
            <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— اختر موظف —</option>
              {available.map((e: any) => (
                <option key={e.id} value={e.id}>{e.full_name || e.email}</option>
              ))}
            </select>
            <Button onClick={grant} className="gradient-primary text-white w-full" disabled={!selectedUser}>
              <Plus className="size-4 ml-1" />منح الصلاحية
            </Button>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            <div className="text-sm font-semibold">المصرح لهم ({accessQ.data?.length ?? 0})</div>
            {accessQ.data?.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between gap-2 p-2 rounded-xl border border-border/40">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{a.full_name || "—"}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{a.email}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => revoke(a.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            ))}
            {!accessQ.data?.length && <div className="text-center text-xs text-muted-foreground p-4">لم يتم منح صلاحية لأحد</div>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ DEVICES ============
function DevicesTab({ userId, employeeName }: { userId?: string; employeeName?: string | null } = {}) {
  const scoped = !!userId;
  const qc = useQueryClient();
  const listFn = useServerFn(adminListDevices);
  const delFn = useServerFn(adminDeleteDevice);
  const resetFn = useServerFn(adminResetUserDevices);
  const addFn = useServerFn(adminAddDevice);
  const empFn = useServerFn(adminListEmployees);
  const devices = useQuery({ queryKey: ["admin-devices"], queryFn: () => listFn() });
  const employees = useQuery({ queryKey: ["admin-devices-employees"], queryFn: () => empFn(), enabled: !scoped });
  const [newUserId, setNewUserId] = useState<string>(userId ?? "");
  const [newFp, setNewFp] = useState<string>("");
  const [newLabel, setNewLabel] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [filterUser, setFilterUser] = useState<string>("");


  async function addDevice() {
    if (!newUserId || newFp.trim().length < 6) { toast.error("اختر موظف وأدخل معرّف الجهاز"); return; }
    setSaving(true);
    try {
      await addFn({ data: { user_id: newUserId, fingerprint: newFp.trim(), label: newLabel.trim() || undefined } });
      toast.success("تم تفعيل الجهاز");
      setNewFp(""); setNewLabel("");
      qc.invalidateQueries({ queryKey: ["admin-devices"] });
    } catch (e: any) { toast.error(e.message || "فشل"); }
    finally { setSaving(false); }
  }

  const grouped = new Map<string, any[]>();
  for (const d of (devices.data ?? []) as any[]) {
    if (scoped && d.user_id !== userId) continue;
    if (!grouped.has(d.user_id)) grouped.set(d.user_id, []);
    grouped.get(d.user_id)!.push(d);
  }
  const entries = Array.from(grouped.entries()).filter(([uid]) => !filterUser || uid === filterUser);


  return (
    <div className="space-y-4">
      <div className="card-surface rounded-2xl p-4 space-y-3">
        <div className="font-bold text-sm">
          {scoped ? `تفعيل جهاز جديد لـ ${employeeName || "هذا الموظف"}` : "تفعيل جهاز جديد لموظف"}
        </div>
        <p className="text-xs text-muted-foreground">اطلب من الموظف فتح صفحة الكورسات ونسخ معرّف الجهاز الظاهر له، ثم ألصقه هنا.</p>
        <div className={scoped ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 md:grid-cols-2 gap-3"}>
          {!scoped && (
            <div>
              <Label className="text-xs">الموظف</Label>
              <select value={newUserId} onChange={(e) => setNewUserId(e.target.value)} className="w-full h-10 rounded-xl border border-border/60 bg-background px-3 text-sm">
                <option value="">— اختر —</option>
                {(employees.data ?? []).map((u: any) => {
                  const uid = u.id ?? u.user_id;
                  return <option key={uid} value={uid}>{u.full_name || u.email}</option>;
                })}
              </select>
            </div>
          )}
          <div>
            <Label className="text-xs">اسم مختصر (اختياري)</Label>
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="مثلاً: لابتوب المكتب" />
          </div>
        </div>
        <div>
          <Label className="text-xs">معرّف الجهاز (ID)</Label>
          <Input value={newFp} onChange={(e) => setNewFp(e.target.value)} placeholder="الصق المعرّف الذي أرسله الموظف" className="font-mono text-xs" />
        </div>
        <Button onClick={addDevice} disabled={saving} className="gradient-primary text-white">
          {saving ? <Loader2 className="size-4 animate-spin ml-1" /> : null}تفعيل الجهاز
        </Button>
      </div>

      {!scoped && (
        <div className="card-surface rounded-2xl p-4 space-y-2">
          <Label className="text-xs">عرض أجهزة موظف محدد</Label>
          <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="w-full h-10 rounded-xl border border-border/60 bg-background px-3 text-sm">
            <option value="">— كل الموظفين —</option>
            {Array.from(grouped.entries()).map(([uid, list]) => (
              <option key={uid} value={uid}>{list[0].full_name || list[0].email} ({list.length})</option>
            ))}
          </select>
        </div>
      )}


      {devices.isLoading ? <Loader2 className="animate-spin mx-auto" /> :
        !entries.length ? <div className="card-surface p-8 text-center text-muted-foreground rounded-2xl">لا توجد أجهزة مسجّلة بعد</div> :
        <div className="space-y-3">
          {entries.map(([uid, list]) => (

            <div key={uid} className="card-surface rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div>
                  <div className="font-bold">{list[0].full_name || list[0].email}</div>
                  <div className="text-xs text-muted-foreground">{list[0].email} • {list.length} جهاز</div>
                </div>
                <Button size="sm" variant="outline" onClick={async () => {
                  if (!confirm("مسح كل أجهزة هذا الموظف؟")) return;
                  await resetFn({ data: { user_id: uid } });
                  qc.invalidateQueries({ queryKey: ["admin-devices"] });
                }}><Repeat className="size-4 ml-1" />فك الربط بالكامل</Button>
              </div>
              <div className="space-y-2">
                {list.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded-xl border border-border/40">
                    <div className="min-w-0 text-xs">
                      <div className="font-mono truncate">{d.device_label || d.device_fingerprint.slice(0, 16) + "…"}</div>
                      <div className="text-muted-foreground truncate">{d.user_agent?.slice(0, 80)}</div>
                      <div className="text-muted-foreground">آخر ظهور: {new Date(d.last_seen_at).toLocaleString("ar")}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={async () => {
                      if (!confirm("حذف هذا الجهاز؟")) return;
                      await delFn({ data: { device_id: d.id } });
                      qc.invalidateQueries({ queryKey: ["admin-devices"] });
                    }}><Trash2 className="size-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}
