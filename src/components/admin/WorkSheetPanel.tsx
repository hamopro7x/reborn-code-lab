import { EmployeeWorkView } from "@/components/admin/EmployeeWorkView";
import { AdminSheet } from "@/components/admin/AdminSheet";

/**
 * قسم «جدول بيانات الشغل».
 * - واجهة الموظف: كما هي بالكامل (EmployeeWorkView).
 * - واجهة الأدمن: جدول بيانات حر (Spreadsheet) مستقل.
 */
export function WorkSheetPanel({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin) return <EmployeeWorkView />;
  return (
    <div className="min-h-[40vh]" dir="rtl">
      <AdminSheet />
    </div>
  );
}

