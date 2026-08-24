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

/** قائمة اختيار الشفت — بنفس أسلوب قائمة الموظفين (Popover). */
function ShiftPickerMenu({
  open,
  onOpenChange,
  userId,
  selectedId,
  onSelect,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
  selectedId: string | null;
  onSelect: (shift: Shift) => void;
  children: React.ReactNode;
}) {
  const listFn = useServerFn(getEmployeeShiftList);
  const q = useQuery({
    queryKey: ["admin-employee-shifts", userId],
    queryFn: () => listFn({ data: { userId: userId! } }) as Promise<Shift[]>,
    enabled: open && !!userId,
  });
  const shifts = q.data ?? [];

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
            شفتات الموظف
          </div>
          <div className="max-h-60 overflow-y-auto p-2">
            {!userId ? (
              <p className="p-3 text-center text-xs text-white/60">اختر موظفًا أولاً</p>
            ) : q.isLoading ? (
              <Loader2 className="mx-auto my-4 size-4 animate-spin text-muted-foreground" />
            ) : shifts.length === 0 ? (
              <p className="p-3 text-center text-xs text-white/60">لا توجد شفتات</p>
            ) : (
              <ul className="space-y-1">
                {shifts.map((sh) => {
                  const active = sh.id === selectedId;
                  const start = fmtShift(sh.startedAt);
                  const end = sh.endedAt ? fmtShift(sh.endedAt) : null;
                  return (
                    <li key={sh.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(sh)}
                        className={`w-full rounded-2xl px-4 py-3 text-right transition ${
                          active
                            ? "bg-[#0d0d0d] text-blue-300 ring-1 ring-blue-500/40 shadow-[0_0_20px_-6px_oklch(0.55_0.28_305/0.5)]"
                            : "bg-[#0a0a0a] text-white/85 hover:bg-[#111]"
                        }`}
                      >
                        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3" dir="rtl">
                          {/* بداية الشفت — الجزء الأيمن */}
                          <div className="flex flex-col items-start justify-center gap-0.5">
                            <span className="text-[10px] font-normal text-white/40">بداية</span>
                            <span className="text-[12px] font-bold leading-tight text-white/95">
                              {start.day}
                            </span>
                            <span className="text-[11px] text-white/65">
                              {start.date}
                            </span>
                            <span className="text-[13px] font-bold text-blue-300">
                              {start.time}
                            </span>
                          </div>

                          {/* فاصل إلى */}
                          <div className="flex flex-col items-center justify-center gap-1 self-stretch">
                            <div className="h-6 w-px bg-white/10" />
                            <span className="text-[10px] font-bold text-white/40">إلى</span>
                            <div className="h-6 w-px bg-white/10" />
                          </div>

                          {/* نهاية الشفت — الجزء الأيسر */}
                          <div className="flex flex-col items-end justify-center gap-0.5">
                            <span className="text-[10px] font-normal text-white/40">انتهاء</span>
                            {end ? (
                              <>
                                <span className="text-[12px] font-bold leading-tight text-white/95">
                                  {end.day}
                                </span>
                                <span className="text-[11px] text-white/65">
                                  {end.date}
                                </span>
                                <span className="text-[13px] font-bold text-blue-300">
                                  {end.time}
                                </span>
                              </>
                            ) : (
                              <span className="text-[13px] font-bold text-emerald-400">شغّال الآن</span>
                            )}
                          </div>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between border-t border-white/5 pt-2 text-[11px] font-normal text-white/50">
                          <span>{sh.txns} معاملة</span>
                          {sh.open && (
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                              <span className="size-1.5 rounded-full bg-emerald-400" />
                              مفتوح
                            </span>
                          )}
                        </div>
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

