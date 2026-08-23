import { useState } from "react";
import { EmployeeWorkView } from "@/components/admin/EmployeeWorkView";
import { AdminSheet } from "@/components/admin/AdminSheet";
import sheetBg from "@/assets/sheet-bg3.png.asset.json";

type TabKey = "sheet" | "employees";

/**
 * قسم «جدول بيانات الشغل».
 * - واجهة الموظف: كما هي بالكامل (EmployeeWorkView).
 * - واجهة الأدمن: تبويبان (جدول بيانات حر + قسم الموظفين المحجوز لشغل لاحق).
 */
export function WorkSheetPanel({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<TabKey>("sheet");
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
        <div className="relative">
          <div className="relative flex items-center justify-start gap-3 px-4 pb-0 pt-4 md:px-6">
            <button
              type="button"
              onClick={() => setTab("sheet")}
              className={`inline-flex flex-row-reverse items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold text-white transition ${
                tab === "sheet"
                  ? "bg-[#1a1a1a] text-blue-300 shadow-[0_0_20px_-4px_oklch(0.55_0.28_305/0.7),0_0_0_1px_oklch(0.55_0.28_305/0.5)] ring-1 ring-blue-500/40"
                  : "bg-[#0d0d0d] opacity-80 shadow-[0_6px_20px_-6px_rgba(0,0,0,0.9)] hover:opacity-95 hover:ring-1 hover:ring-blue-500/20"
              }`}
            >
              جدول بيانات
            </button>
            <button
              type="button"
              onClick={() => setTab("employees")}
              className={`inline-flex flex-row-reverse items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold text-white transition ${
                tab === "employees"
                  ? "bg-[#1a1a1a] text-blue-300 shadow-[0_0_20px_-4px_oklch(0.55_0.28_305/0.7),0_0_0_1px_oklch(0.55_0.28_305/0.5)] ring-1 ring-blue-500/40"
                  : "bg-[#0d0d0d] opacity-80 shadow-[0_6px_20px_-6px_rgba(0,0,0,0.9)] hover:opacity-95 hover:ring-1 hover:ring-blue-500/20"
              }`}
            >
              قائمة الموظفين
            </button>
          </div>

          <div className="h-[57px]" />
        </div>

        <div>
          {tab === "sheet" ? <AdminSheet /> : <EmployeesPlaceholder />}
        </div>
      </div>
    </div>
  );
}

function EmployeesPlaceholder() {
  return (
    <div
      className="relative w-full bg-black"
      style={{
        aspectRatio: "1685 / 922",
        backgroundImage: `url(${employeesBg.url})`,
        backgroundSize: "100% 100%",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
