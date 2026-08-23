import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Users } from "lucide-react";
import { EmployeeWorkView } from "@/components/admin/EmployeeWorkView";
import { AdminSheet } from "@/components/admin/AdminSheet";
import { adminListEmployees } from "@/lib/courses.functions";
import sheetBg from "@/assets/sheet-bg3.png.asset.json";
import iconDatasheet from "@/assets/icon-datasheet.png";
import iconEmployees from "@/assets/icon-employees.png";

type TabKey = "sheet" | "employees";

/**
 * قسم «جدول بيانات الشغل».
 * - واجهة الموظف: كما هي بالكامل (EmployeeWorkView).
 * - واجهة الأدمن: تبويبان (جدول بيانات حر + قائمة الموظفين).
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
              className={`inline-flex flex-row-reverse items-center gap-2 rounded-full bg-[#0d0d0d] px-4 py-2 text-sm font-extrabold text-white shadow-[0_6px_20px_-6px_rgba(0,0,0,0.9)] transition ${
                tab === "sheet" ? "opacity-100" : "opacity-80 hover:opacity-95"
              }`}
            >
              <img src={iconDatasheet} alt="" loading="lazy" width={24} height={24} className="h-6 w-6 object-contain" />
              جدول بيانات
            </button>
            <button
              type="button"
              onClick={() => setTab("employees")}
              className={`inline-flex flex-row-reverse items-center gap-2 rounded-full bg-[#0d0d0d] px-4 py-2 text-sm font-extrabold text-white shadow-[0_6px_20px_-6px_rgba(0,0,0,0.9)] transition ${
                tab === "employees" ? "opacity-100" : "opacity-80 hover:opacity-95"
              }`}
            >
              <img src={iconEmployees} alt="" loading="lazy" width={24} height={24} className="h-6 w-6 object-contain" />
              قائمة الموظفين
            </button>
          </div>

          <div className="h-[57px]" />
        </div>

        <div className="bg-black">
          {tab === "sheet" ? <AdminSheet /> : <EmployeesList />}
        </div>
      </div>
    </div>
  );
}

function EmployeesList() {
  const list = useServerFn(adminListEmployees);
  const { data, isLoading } = useQuery({ queryKey: ["worksheet-employees"], queryFn: () => list() });

  if (isLoading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="admin-sheet-surface">
      <table className="data-table admin-sheet-table w-full table-fixed">
        <thead>
          <tr>
            <th><span className="flex h-full items-center justify-center text-xs font-extrabold text-white">الاسم</span></th>
            <th><span className="flex h-full items-center justify-center text-xs font-extrabold text-white">البريد</span></th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((p: { id: string; email: string | null; full_name: string | null }) => (
            <tr key={p.id}>
              <td className="px-3 py-4 text-center text-xs">{p.full_name ?? "—"}</td>
              <td className="px-3 py-4 text-center text-xs">{p.email ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
