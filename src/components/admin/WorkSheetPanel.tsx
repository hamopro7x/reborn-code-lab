import { EmployeeWorkView } from "@/components/admin/EmployeeWorkView";

/**
 * قسم «جدول بيانات الشغل».
 * - واجهة الموظف: كما هي بالكامل (EmployeeWorkView).
 * - واجهة الأدمن: فاضية حاليًا (تحت التطوير).
 */
export function WorkSheetPanel({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin) return <EmployeeWorkView />;
  return <div className="min-h-[40vh]" dir="rtl" />;
}
