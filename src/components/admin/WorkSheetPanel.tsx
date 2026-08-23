import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { EmployeeWorkView } from "@/components/admin/EmployeeWorkView";
import { AdminSheet } from "@/components/admin/AdminSheet";
import { listEmployees } from "@/lib/admin.functions";
import sheetBg from "@/assets/sheet-bg3.png.asset.json";
import employeesBg from "@/assets/employees-bg.png.asset.json";

type TabKey = "sheet" | "employees";

const CHIP_BASE =
  "inline-flex flex-row-reverse items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold text-white transition";
const CHIP_ON =
  "bg-[#1a1a1a] text-blue-300 shadow-[0_0_20px_-4px_oklch(0.55_0.28_305/0.7),0_0_0_1px_oklch(0.55_0.28_305/0.5)] ring-1 ring-blue-500/40";
const CHIP_OFF =
  "bg-[#0d0d0d] opacity-80 shadow-[0_6px_20px_-6px_rgba(0,0,0,0.9)] hover:opacity-95 hover:ring-1 hover:ring-blue-500/20";

type Employee = {
  user_id: string;
  role: string;
  email: string;
  full_name: string;
};

/** الشريط الجانبي لاختيار الموظف — يظهر فوق التصميم الحالي دون تغييره. */
function EmployeePickerSidebar({
  open,
  onClose,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  selectedId: string | null;
  onSelect: (emp: Employee) => void;
}) {
  const list = useServerFn(listEmployees);
  const q = useQuery({
    queryKey: ["admin-employees"],
    queryFn: () => list() as Promise<Employee[]>,
    enabled: open,
  });
  const employees = (q.data ?? []).filter((e) => e.role === "employee");

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-30" dir="rtl">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-[280px] max-w-[85%] flex-col border-l border-blue-500/25 bg-[#0b0b0b]/95 shadow-[0_0_40px_-10px_rgba(0,0,0,0.95)] backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="text-sm font-extrabold text-blue-300">قائمة الموظفين</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {q.isLoading ? (
            <p className="p-3 text-xs text-white/60">جارٍ التحميل…</p>
          ) : employees.length === 0 ? (
            <p className="p-3 text-xs text-white/60">لا يوجد موظفين</p>
          ) : (
            <ul className="space-y-1">
              {employees.map((emp) => {
                const active = emp.user_id === selectedId;
                return (
                  <li key={emp.user_id}>
                    <button
                      type="button"
                      onClick={() => onSelect(emp)}
                      className={`w-full truncate rounded-xl px-3 py-2 text-right text-xs font-bold transition ${
                        active
                          ? "bg-[#1a1a1a] text-blue-300 ring-1 ring-blue-500/40"
                          : "bg-[#111] text-white/85 hover:bg-[#181818]"
                      }`}
                    >
                      {emp.full_name || emp.email}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

/**
 * قسم «جدول بيانات الشغل».
 * - واجهة الموظف: كما هي بالكامل (EmployeeWorkView).
 * - واجهة الأدمن: تبويبان (جدول بيانات حر + قسم الموظفين المحجوز لشغل لاحق).
 */
export function WorkSheetPanel({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<TabKey>("sheet");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);
  if (!isAdmin) return <EmployeeWorkView />;


  const isEmployees = tab === "employees";

  return (
    <div className="min-h-[40vh] -mx-4 md:-mx-6 -mt-4 md:-mt-6" dir="rtl">
      <div
        className="relative flex min-h-[calc(100vh-80px)] flex-col"
        style={{
          backgroundImage: `url(${isEmployees ? employeesBg.url : sheetBg.url})`,
          backgroundSize: isEmployees ? "cover" : "100% auto",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
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

        {isEmployees ? (
          <div className="flex-1" />
        ) : (
          <>
            <div className="h-[57px]" />
            <AdminSheet />
          </>
        )}
      </div>
    </div>
  );
}

