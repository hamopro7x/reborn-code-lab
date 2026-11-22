import { AdminSheet } from "@/components/admin/AdminSheet";
import { BybitTab } from "@/components/admin/BybitTab";
import { ApiKeyPanel } from "@/components/admin/bybit/BybitAccountManagement";
import { WorkSheetPanel } from "@/components/admin/WorkSheetPanel";
import { GmailInbox } from "@/components/admin/GmailInbox";
import { MailNotifier } from "@/components/admin/mail/MailNotifications";
import { StaffChat } from "@/components/admin/StaffChat";
import { ReportsTab } from "@/components/admin/ReportsTab";
import { ProductsTab } from "@/components/admin/ProductsTab";
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
import type { PanelKey } from "@/lib/admin-panel-access";

export function AdminPanelContent({
  panel,
  isEmployee,
  isAdmin,
  canView,
  setPanel,
  messageId,
}: {
  panel: PanelKey;
  isEmployee: boolean;
  isAdmin: boolean;
  canView: (key: PanelKey) => boolean;
  setPanel: (key: PanelKey) => void;
  messageId?: string;
}) {
  return (
    <div className="min-w-0">
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
      {canView("mail") && <MailNotifier onOpen={() => setPanel("mail")} />}
      {panel === "overview" && canView("overview") && <OverviewTab readOnly={isEmployee} />}
      {panel === "orders" && <OrdersTab isAdmin={isAdmin} />}
      {panel === "customers" && canView("customers") && <CustomersTab />}
      {panel === "reviews" && canView("reviews") && <ReviewsTab />}
      {panel === "reports" && canView("reports") && <ReportsTab />}
      {panel === "cardtx" && canView("cardtx") && <BybitTab isAdmin={isAdmin} />}
      {panel === "worksheet" && canView("worksheet") && <WorkSheetPanel isAdmin={isAdmin} />}
      {panel === "sheet" && isAdmin && <AdminSheet />}
      {panel === "mail" && canView("mail") && <GmailInbox isAdmin={isAdmin} />}
      {panel === "chat" && <StaffChat targetId={messageId} />}
      {panel === "products" && canView("products") && <ProductsTab />}
      {panel === "categories" && canView("categories") && <CategoriesTab />}
      {panel === "timers" && canView("timers") && <TimersTab />}
      {panel === "employees" && canView("employees") && <EmployeesTab />}
      {panel === "courses" && <CoursesTab isAdmin={isAdmin} />}
      {panel === "remote" && canView("remote") && <DeviceMonitorGrid screensOnly />}
      {panel === "payments" && canView("payments") && <PaymentsTab />}
      {panel === "currencies" && canView("currencies") && <CurrenciesTab />}
      {panel === "apikey" && isAdmin && (
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
  );
}
