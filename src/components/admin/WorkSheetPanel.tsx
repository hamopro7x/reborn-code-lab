import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Users } from "lucide-react";
import { EmployeeWorkView } from "@/components/admin/EmployeeWorkView";
import { AdminSheet } from "@/components/admin/AdminSheet";
import { adminListEmployees } from "@/lib/courses.functions";
import sheetBg from "@/assets/sheet-bg2.jpg.asset.json";

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
    <div className="min-h-[40vh]" dir="rtl">
      <div
        className="relative -mx-4 -mt-4 md:-mx-6 md:-mt-6"
        style={{
          backgroundImage: `url(${sheetBg.url})`,
          backgroundSize: "cover",
          backgroundPosition: "top left",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="relative flex items-center justify-start gap-2 px-4 pb-1 pt-4 md:px-6">
          <button
            type="button"
            onClick={() => setTab("sheet")}
            className={`inline-flex flex-row-reverse items-center gap-1.5 rounded-2xl px-3 py-2 text-[12px] font-extrabold text-white transition ${
              tab === "sheet" ? "bg-[#151515]/90 shadow-lg" : "bg-[#151515]/60 text-white/85 hover:bg-[#151515]/85"
            }`}
          >
            <span className="text-sm leading-none">🗂️</span>
            جدول بيانات
          </button>
          <button
            type="button"
            onClick={() => setTab("employees")}
            className={`inline-flex flex-row-reverse items-center gap-1.5 rounded-2xl px-3 py-2 text-[12px] font-extrabold text-white transition ${
              tab === "employees" ? "bg-[#151515]/90 shadow-lg" : "bg-[#151515]/60 text-white/85 hover:bg-[#151515]/85"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            قائمة الموظفين
          </button>
        </div>
        <div className="h-10" />
      </div>

      <div className="-mt-10 px-4 md:px-6">
        {tab === "sheet" ? <AdminSheet /> : <EmployeesList />}
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
    <div className="admin-sheet-surface -mx-4 md:-mx-6">
      <table className="data-table admin-sheet-table w-full table-fixed">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>البريد</th>
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
