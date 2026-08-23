import { EmployeeWorkView } from "@/components/admin/EmployeeWorkView";
import { AdminSheet } from "@/components/admin/AdminSheet";
import sheetBg from "@/assets/sheet-bg3.png.asset.json";

/**
 * قسم «جدول بيانات الشغل».
 * - واجهة الموظف: كما هي بالكامل (EmployeeWorkView).
 * - واجهة الأدمن: جدول بيانات حر فقط (تم حذف قائمة الموظفين حالياً لإعادة استخدام القسم).
 */
export function WorkSheetPanel({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin) return <EmployeeWorkView />;

  return (
    <div className="min-h-[40vh] -mx-4 md:-mx-6 -mt-4 md:-mt-6" dir="rtl">
      <div
        className="relative"
        style={{
          backgroundImage: `url(${sheetBg.url})`,
          backgroundSize: "100% auto",
          backgroundPosition: "top center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="h-[57px]" />
        <AdminSheet />
      </div>
    </div>
  );
}
