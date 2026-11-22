import { MailNotifier } from "@/components/admin/mail/MailNotifications";
import { OverviewTab } from "@/components/admin/panels/OverviewTab";
import { CustomersTab } from "@/components/admin/panels/CustomersTab";
import { OrdersTab } from "@/components/admin/panels/OrdersTab";
import { WorkSheetPanel } from "@/components/admin/WorkSheetPanel";
import { GmailInbox } from "@/components/admin/GmailInbox";
import { StaffChat } from "@/components/admin/StaffChat";
import { CoursesTab } from "@/components/admin/panels/CoursesTab";
import { ReportsTab } from "@/components/admin/ReportsTab";
import type { PanelKey } from "@/lib/admin-panel-access";

/** Employee-only renderer. Admin-only panels are intentionally absent. */
export function EmployeePanelContent({
  panel,
  canView,
  setPanel,
  messageId,
}: {
  panel: PanelKey;
  canView: (key: PanelKey) => boolean;
  setPanel: (key: PanelKey) => void;
  messageId?: string;
}) {
  return (
    <div className="min-w-0">
      {panel === "orders" && (
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
      {panel === "overview" && canView("overview") && <OverviewTab readOnly />}
      {panel === "orders" && <OrdersTab isAdmin={false} />}
      {panel === "customers" && canView("customers") && <CustomersTab />}
      {panel === "reports" && canView("reports") && <ReportsTab />}
      {panel === "worksheet" && canView("worksheet") && <WorkSheetPanel isAdmin={false} />}
      {panel === "mail" && canView("mail") && <GmailInbox isAdmin={false} />}
      {panel === "chat" && <StaffChat targetId={messageId} />}
      {panel === "courses" && <CoursesTab isAdmin={false} />}
    </div>
  );
}
