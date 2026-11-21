import {
  DateTimeInput } from "@/components/ui/date-time-input";
import { formatLocaleDateTime } from "@/lib/format";
import { createFileRoute,
  Link,
  useNavigate } from "@tanstack/react-router";
import { useQuery,
  useQueryClient } from "@tanstack/react-query";
import { useEffect,
  useRef,
  useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import { useChatBadge } from "@/lib/chat-badge";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
  } from "@/components/ui/sidebar";
import { SidebarGlider } from "@/components/admin/SidebarGlider";
import headerMark from "@/assets/mg-metallic-logo-3d.png";
import { AdminLangToggle,
  AdminTranslator,
  useAdminLang } from "@/lib/admin-i18n/translator";
import {
  LayoutDashboard,
  Package,
  Layers,
  ShoppingCart,
  CreditCard,
  Coins,
  Clock,
  Settings2,
  Plus,
  Trash2,
  Edit,
  ExternalLink,
  X,
  Users,
  Loader2,
  Star,
  UserCog,
  LogOut,
  Repeat,
  GraduationCap,
  MonitorSmartphone,
  Upload,
  PlayCircle,
  Lock,
  Camera,
  Download,
  ChevronRight,
} from "lucide-react";

import { useServerFn } from "@tanstack/react-start";
import { createEmployee, deleteEmployee, listEmployees, updateEmployeeAvatar, updateEmployee } from "@/lib/admin.functions";
import { adminListDevices, adminDeleteDevice, adminResetUserDevices, adminAddDevice, adminListEmployees,
  adminListCourseAccess, adminGrantCourseAccess, adminRevokeCourseAccess, checkDevice, getViewerIdentity } from "@/lib/courses.functions";
import {
} from "@/lib/categories.functions";

import { ShieldAlert } from "lucide-react";
import { ReportsTab } from "@/components/admin/ReportsTab";
import { ProductsTab } from "@/components/admin/ProductsTab";
import { AdminBackProvider, useAdminBack, useAdminBackTarget } from "@/components/admin/back-nav";
import { BybitTab, ApiKeyPanel } from "@/components/admin/BybitTab";
import { FileBarChart, MonitorPlay, Image as ImageIcon, ChevronUp, ChevronDown, WalletCards, KeyRound, ClipboardList, Table2 } from "lucide-react";
import { WorkSheetPanel } from "@/components/admin/WorkSheetPanel";
import { AdminSheet } from "@/components/admin/AdminSheet";
import { GmailInbox, MailNotifier } from "@/components/admin/GmailInbox";
import { StaffChat } from "@/components/admin/StaffChat";
import { MessagesSquare } from "lucide-react";
import { Mail } from "lucide-react";
import { OverviewTab } from "@/components/admin/panels/OverviewTab";
import { CustomersTab } from "@/components/admin/panels/CustomersTab";
import { ReviewsTab } from "@/components/admin/panels/ReviewsTab";
import { OrdersTab } from "@/components/admin/panels/OrdersTab";
import { CategoriesTab } from "@/components/admin/panels/CategoriesTab";
import { TimersTab } from "@/components/admin/panels/TimersTab";
import { SettingsTab } from "@/components/admin/panels/SettingsTab";
import { CurrenciesTab } from "@/components/admin/panels/CurrenciesTab";
import { PaymentsTab } from "@/components/admin/panels/PaymentsTab";

import { LessonUploader } from "@/components/admin/LessonUploader";
import { DeviceMonitorGrid } from "@/components/admin/DeviceMonitorGrid";
import { EmployeeDevices } from "@/components/admin/DeviceMonitorGrid";
import { HeroBannerManager } from "@/components/admin/HeroBannerManager";
import { FooterManager } from "@/components/admin/FooterManager";
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

// ============ READ ONLY WRAPPER ============

// ============ OVERVIEW ============

// ============ CUSTOMERS ============
// ============ REVIEWS ============
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
    refetchInterval: livePoll(60_000),
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
                  <div className="rounded-md bg-muted/60 border border-border/50 px-3 py-2.5 text-sm font-medium truncate">{formatLocaleDateTime(u.created_at, "ar-EG")}</div>
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
// ============ PRODUCTS ============

// ============ CATEGORIES ============
// ============ PAYMENT METHODS ============
// ============ CURRENCIES / FX ============
// ============ TIMERS ============
// ============ SETTINGS ============
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
                      <div className="text-muted-foreground">آخر ظهور: {formatLocaleDateTime(d.last_seen_at, "ar")}</div>
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

function ChatNavBadge() {
  const n = useChatBadge();
  if (!n) return null;
  return <span className="ms-auto min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center">{n > 99 ? "99+" : n}</span>;
}
