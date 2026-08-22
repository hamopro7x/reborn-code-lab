import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Users } from "lucide-react";
import { EmployeeWorkView } from "@/components/admin/EmployeeWorkView";
import { AdminSheet } from "@/components/admin/AdminSheet";
import { FintechBackdrop } from "@/components/admin/FintechBackdrop";
import { adminListEmployees } from "@/lib/courses.functions";

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
      <div className="relative -mx-4 mb-2 overflow-hidden md:-mx-6">
        <FintechBackdrop className="absolute inset-0" />
        <div className="relative flex items-center justify-start gap-3 px-4 py-4 md:px-6">
          <button
            type="button"
            onClick={() => setTab("sheet")}
            className={`inline-flex flex-row-reverse items-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold transition ${
              tab === "sheet"
                ? "border border-white/15 bg-black/70 text-white shadow-[0_0_0_1px_oklch(0.55_0.2_265/0.5),0_10px_30px_-12px_oklch(0_0_0/0.8)]"
                : "border border-white/10 bg-black/50 text-white/80 hover:text-white"
            }`}
          >
            <span className="text-lg leading-none">🗂️</span>
            جدول بيانات
          </button>
          <button
            type="button"
            onClick={() => setTab("employees")}
            className={`inline-flex flex-row-reverse items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition ${
              tab === "employees"
                ? "border border-white/15 bg-black/70 text-white shadow-[0_0_0_1px_oklch(0.55_0.2_265/0.5),0_10px_30px_-12px_oklch(0_0_0/0.8)]"
                : "border border-white/10 bg-black/50 text-white/80 hover:text-white"
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
