import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { EmployeeWorkView } from "@/components/admin/EmployeeWorkView";
import { AdminSheet } from "@/components/admin/AdminSheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listEmployees } from "@/lib/admin.functions";
import { getEmployeeShiftList } from "@/lib/work.functions";
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
  avatar_signed_url?: string | null;
};

/** لوحة اختيار الموظف — بنفس أسلوب شريط «ربط طلبات P2P» (Popover فوق الواجهة). */
function EmployeePickerMenu({
  open,
  onOpenChange,
  selectedId,
  onSelect,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedId: string | null;
  onSelect: (emp: Employee) => void;
  children: React.ReactNode;
}) {
  const list = useServerFn(listEmployees);
  const q = useQuery({
    queryKey: ["admin-employees"],
    queryFn: () => list() as Promise<Employee[]>,
    enabled: open,
  });
  const employees = (q.data ?? []).filter((e) => e.role === "employee");

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        dir="rtl"
        align="center"
        className="w-auto max-w-[92vw] border-0 bg-transparent p-0 shadow-none"
      >
        <div className="w-[330px] overflow-hidden rounded-xl border border-border/50 bg-[oklch(0.135_0_0)] shadow-2xl">
          <div className="data-table-head truncate px-3 py-1.5 text-center text-[11px] font-bold">
            اختر الموظف
          </div>
          <div className="max-h-60 overflow-y-auto p-2">
            {q.isLoading ? (
              <Loader2 className="mx-auto my-4 size-4 animate-spin text-muted-foreground" />
            ) : employees.length === 0 ? (
              <p className="p-3 text-center text-xs text-white/60">لا يوجد موظفين</p>
            ) : (
              <ul className="space-y-1">
                {employees.map((emp) => {
                  const active = emp.user_id === selectedId;
                  return (
                    <li key={emp.user_id}>
                      <button
                        type="button"
                        onClick={() => onSelect(emp)}
                        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-right text-xs font-bold transition ${
                          active
                            ? "bg-[#1a1a1a] text-blue-300 ring-1 ring-blue-500/40"
                            : "bg-[#111] text-white/85 hover:bg-[#181818]"
                        }`}
                      >
                        <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 text-[10px] text-white/60">
                          {emp.avatar_signed_url ? (
                            <img
                              src={emp.avatar_signed_url}
                              alt={emp.full_name || emp.email}
                              className="size-full object-cover"
                            />
                          ) : (
                            (emp.full_name || emp.email || "?").slice(0, 1)
                          )}
                        </span>
                        <span className="truncate">{emp.full_name || emp.email}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type Shift = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  open: boolean;
  txns: number;
  label?: string;
};

const fmtShift = (ms: number) => {
  const d = new Date(ms);
  const day = d.toLocaleDateString("ar-EG", { weekday: "long" });
  const date = d.toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return { day, date, time };
};

/** Sidebar يعرض شفتات الموظف المختار بنفس تصميم المرجع. */
function ShiftSidebar({
  userId,
  selectedId,
  onSelect,
}: {
  userId: string | null;
  selectedId: string | null;
  onSelect: (shift: Shift) => void;
}) {
  const listFn = useServerFn(getEmployeeShiftList);
  const q = useQuery({
    queryKey: ["admin-employee-shifts", userId],
    queryFn: () => listFn({ data: { userId: userId! } }) as Promise<Shift[]>,
    enabled: !!userId,
  });
  const shifts = q.data ?? [];

  if (!userId) {
    return (
      <aside className="w-[320px] shrink-0 rounded-xl border border-border/40 bg-[oklch(0.115_0_0)] p-4 text-center text-xs text-white/50">
        اختر موظفًا لعرض شفتاته
      </aside>
    );
  }

  return (
    <aside className="w-[320px] shrink-0 rounded-xl border border-border/40 bg-[oklch(0.115_0_0)] p-3 shadow-2xl">
      {/* Header */}
      <div className="relative mb-3 overflow-hidden rounded-xl bg-[linear-gradient(180deg,#1636e6,#0a24c4)] px-3 py-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_6px_rgba(0,0,0,0.55)]">
        <span className="text-sm font-black text-white">شفتات الموظف</span>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/90">
          رقم الشفت
        </span>
      </div>

      {q.isLoading ? (
        <Loader2 className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
      ) : shifts.length === 0 ? (
        <p className="py-6 text-center text-xs text-white/50">لا توجد شفتات</p>
      ) : (
        <ul className="space-y-2">
          {shifts.map((sh, i) => {
            const active = sh.id === selectedId;
            const start = fmtShift(sh.startedAt);
            const end = sh.endedAt ? fmtShift(sh.endedAt) : null;
            const number = shifts.length - i;
            return (
              <li key={sh.id}>
                <button
                  type="button"
                  onClick={() => onSelect({ ...sh, label: `شفت رقم ${number}` })}
                  className={`flex w-full items-stretch gap-2 rounded-xl border px-2 py-2 text-right transition ${
                    active
                      ? "border-blue-500/40 bg-[oklch(0.13_0_0)] shadow-[0_0_20px_-6px_oklch(0.55_0.28_305/0.5)]"
                      : "border-white/5 bg-[oklch(0.095_0_0)] hover:bg-[oklch(0.11_0_0)]"
                  }`}
                >
                  {/* رقم الشفت */}
                  <div className="flex w-10 shrink-0 items-center justify-center">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[linear-gradient(180deg,#1636e6,#0a24c4)] text-sm font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                      {number}
                    </span>
                  </div>

                  {/* بداية / انتهاء */}
                  <div className="flex flex-1 items-stretch gap-2" dir="rtl">
                    {/* بداية — على اليمين */}
                    <div className="flex flex-1 flex-col items-start gap-1 rounded-lg bg-[oklch(0.055_0_0)] px-2 py-1.5">
                      <span className="rounded bg-[linear-gradient(180deg,#1636e6,#0a24c4)] px-2 py-0.5 text-[10px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                        بدا
                      </span>
                      <div className="flex flex-col gap-0.5 pr-1">
                        <span className="text-[11px] font-bold text-white/90">
                          اليوم: {start.day}
                        </span>
                        <span className="text-[11px] text-white/70">
                          التاريخ: {start.date}
                        </span>
                        <span className="text-[11px] font-bold text-blue-300">
                          الساعه: {start.time}
                        </span>
                      </div>
                    </div>

                    {/* انتهى — على اليسار */}
                    <div className="flex flex-1 flex-col items-start gap-1 rounded-lg bg-[oklch(0.055_0_0)] px-2 py-1.5">
                      <span className="rounded bg-[linear-gradient(180deg,#1636e6,#0a24c4)] px-2 py-0.5 text-[10px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                        انتهي
                      </span>
                      {end ? (
                        <div className="flex flex-col gap-0.5 pr-1">
                          <span className="text-[11px] font-bold text-white/90">
                            اليوم: {end.day}
                          </span>
                          <span className="text-[11px] text-white/70">
                            التاريخ: {end.date}
                          </span>
                          <span className="text-[11px] font-bold text-blue-300">
                            الساعه: {end.time}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-1 items-center justify-center pr-1">
                          <span className="text-[11px] font-black text-emerald-400">شغّال الآن</span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
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
  const [shiftPickerOpen, setShiftPickerOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  if (!isAdmin) return <EmployeeWorkView />;


  const isEmployees = tab === "employees";

  return (
    <div className="min-h-[40vh] -mx-4 md:-mx-6 -mt-4 md:-mt-6" dir="rtl">
      <div className="relative flex min-h-[calc(100vh-80px)] flex-col">
        {isEmployees && (
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage: `url(${employeesBg.url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              backgroundAttachment: "fixed",
            }}
            aria-hidden="true"
          />
        )}

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
          <EmployeePickerMenu
            open={pickerOpen}
            onOpenChange={(v) => {
              if (v) setTab("employees");
              setPickerOpen(v);
            }}
            selectedId={selected?.user_id ?? null}
            onSelect={(emp) => {
              setSelected(emp);
              setSelectedShift(null);
              setPickerOpen(false);
            }}
          >
            <button
              type="button"
              className={`inline-flex flex-row-reverse items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold text-white transition ${
                tab === "employees"
                  ? "bg-[#1a1a1a] text-blue-300 shadow-[0_0_20px_-4px_oklch(0.55_0.28_305/0.7),0_0_0_1px_oklch(0.55_0.28_305/0.5)] ring-1 ring-blue-500/40"
                  : "bg-[#0d0d0d] opacity-80 shadow-[0_6px_20px_-6px_rgba(0,0,0,0.9)] hover:opacity-95 hover:ring-1 hover:ring-blue-500/20"
              }`}
            >
              قائمة الموظفين
            </button>
          </EmployeePickerMenu>
          {isEmployees && selected && (
            <ShiftPickerMenu
              open={shiftPickerOpen}
              onOpenChange={setShiftPickerOpen}
              userId={selected.user_id}
              selectedId={selectedShift?.id ?? null}
              onSelect={(sh) => {
                setSelectedShift(sh);
                setShiftPickerOpen(false);
              }}
            >
              <button
                type="button"
                className={`${CHIP_BASE} ${shiftPickerOpen || selectedShift ? CHIP_ON : CHIP_OFF}`}
              >
                اختيار الشفت
              </button>
            </ShiftPickerMenu>
          )}

        </div>

        {isEmployees ? (
          <div className="relative flex-1">
            {selected && (
              <div className="pb-6 pt-4">
                {/* نفس جدول بيانات الشغل الموجود عند الموظف — بيانات الموظف المختار فقط */}
                <EmployeeWorkView
                  key={`${selected.user_id}:${selectedShift?.id ?? "live"}`}
                  isAdmin
                  viewUserId={selected.user_id}
                  {...(selectedShift ? { viewShiftId: selectedShift.id } : {})}
                  viewShift={selectedShift ?? undefined}
                  viewName={selected.full_name || selected.email}
                  viewAvatar={selected.avatar_signed_url || undefined}
                />
              </div>
            )}
            

          </div>
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

