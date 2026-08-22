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
        className="relative -mx-4 mb-2 h-[113px] overflow-hidden md:-mx-6"
        style={{
          backgroundImage: `url(${sheetBg.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center left",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="relative flex h-full items-center justify-start gap-5 px-4 md:px-6">
          <button
            type="button"
            onClick={() => setTab("sheet")}
            className={`inline-flex flex-row-reverse items-center gap-2 rounded-full px-5 py-2.5 text-sm font-extrabold text-white transition ${
              tab === "sheet" ? "border-2 border-[#2b62ff] bg-black/45" : "border-2 border-transparent hover:bg-black/30"
            }`}
          >
            <span className="text-base leading-none">🗂️</span>
            جدول بيانات
          </button>
          <button
            type="button"
            onClick={() => setTab("employees")}
            className={`inline-flex flex-row-reverse items-center gap-2 rounded-full px-5 py-2.5 text-sm font-extrabold text-white transition ${
              tab === "employees" ? "border-2 border-[#2b62ff] bg-black/45" : "border-2 border-transparent hover:bg-black/30"
            }`}
          >
            <Users className="h-4 w-4" />
            قائمة الموظفين
          </button>
        </div>
      </div>

      {tab === "sheet" ? <AdminSheet /> : <EmployeesList />}
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
