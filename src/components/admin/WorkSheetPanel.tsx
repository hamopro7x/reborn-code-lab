import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, Check, ChevronDown, Eye, EyeOff, History, ListChecks, Loader2, Trash2, X } from "lucide-react";
import { usePersistentState } from "@/lib/persistent-state";
import { EmployeePinMenu } from "@/components/admin/EmployeePinMenu";
import { EmployeeWorkView } from "@/components/admin/EmployeeWorkView";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { listEmployees } from "@/lib/admin.functions";
import { getEmployeeShiftList, deleteEmployeeShift, getSharedShiftId, setSharedShift, getMySharedShift, markShiftReviewed, archiveEmployeeShifts } from "@/lib/work.functions";
import employeesBg from "@/assets/employees-bg.png.asset.json";

/** ألوان مجموعات ربط P2P — الشفتات اللي اتربطو بنفس الطلب تاخد لون واحد، وكل مجموعة لون مختلف. */
const GROUP_COLOR_CLASSES = [
  "border-rose-400/70 bg-rose-500/10",
  "border-amber-400/70 bg-amber-500/10",
  "border-emerald-400/70 bg-emerald-500/10",
  "border-cyan-400/70 bg-cyan-500/10",
  "border-violet-400/70 bg-violet-500/10",
  "border-fuchsia-400/70 bg-fuchsia-500/10",
  "border-lime-400/70 bg-lime-500/10",
  "border-orange-400/70 bg-orange-500/10",
  "border-sky-400/70 bg-sky-500/10",
  "border-pink-400/70 bg-pink-500/10",
];



const CHIP_BASE =
  "inline-flex flex-row-reverse items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold text-white transition";
const CHIP_ON =
  "bg-[#1a1a1a] text-blue-300 shadow-[0_0_20px_-4px_oklch(0.78_0.24_120/0.7),0_0_0_1px_oklch(0.78_0.24_120/0.5)] ring-1 ring-blue-500/40";
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
    // قائمة الموظفين تتغيّر نادراً: بدون هذا كانت تُجلب من جديد مع كل فتح.
    staleTime: 15_000,
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
  reviewed?: boolean;
  label?: string;
  /** مجموعة ربط P2P — الشفتات اللي اتربطو بنفس الطلب تحمل نفس المعرف. */
  linkGroup?: string | null;
};

/** توقيت موحّد (القاهرة) بأرقام لاتينية حتى تتطابق شاشة الأدمن مع الموظف. */
const shiftFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Cairo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});
const SHIFT_DAY_AR: Record<string, string> = {
  Sun: "الأحد", Mon: "الإثنين", Tue: "الثلاثاء", Wed: "الأربعاء",
  Thu: "الخميس", Fri: "الجمعة", Sat: "السبت",
};

const fmtShift = (ms: number) => {
  const parts = shiftFmt.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  const ampm = get("dayPeriod").toLowerCase().includes("a") ? "ص" : "م";
  return {
    day: SHIFT_DAY_AR[get("weekday")] ?? get("weekday"),
    date: `${get("day")}/${get("month")}/${get("year")}`,
    time: `${get("hour")}:${get("minute")} ${ampm}`,
  };
};

/** قائمة اختيار الشفت (Popover) بنفس تصميم كروت الشفتات الجديد. */
function ShiftPickerMenu({
  userId,
  selectedId,
  onSelect,
  onDeleted,
  open,
  onOpenChange,
  children,
}: {
  userId: string | null;
  selectedId: string | null;
  onSelect: (shift: Shift) => void;
  onDeleted: (shiftId: string) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const listFn = useServerFn(getEmployeeShiftList);
  const del = useServerFn(deleteEmployeeShift);
  const q = useQuery({
    queryKey: ["admin-employee-shifts", userId],
    queryFn: () => listFn({ data: { userId: userId! } }) as Promise<Shift[]>,
    enabled: !!userId && open,
    staleTime: 15_000,
  });

  const shifts = q.data ?? [];
  // كل مجموعة شفتات مرتبطة بطلب P2P واحد تاخد لون ثابت من الألوان بالترتيب.
  const groupColors = new Map<string, string>();
  for (const s of shifts) {
    if (!s.linkGroup || groupColors.has(s.linkGroup)) continue;
    groupColors.set(s.linkGroup, GROUP_COLOR_CLASSES[groupColors.size % GROUP_COLOR_CLASSES.length]);
  }
  const sharedFn = useServerFn(getSharedShiftId);
  const setSharedFn = useServerFn(setSharedShift);
  const sharedQ = useQuery({
    queryKey: ["admin-shared-shift", userId],
    queryFn: () => sharedFn({ data: { userId: userId! } }),
    enabled: !!userId && open,
  });
  const sharedId = sharedQ.data?.shiftId ?? null;
  const toggleShare = (id: string) => {
    if (!userId) return;
    setSharedFn({ data: { userId, shiftId: sharedId === id ? null : id } })
      .then(() => void sharedQ.refetch())
      .catch((e: any) => window.alert(e?.message || "تعذر الحفظ"));
  };
  // علامة المراجعة تُحفظ في قاعدة البيانات — لا تُمسح نهائيًا مهما تغيّر المتصفح أو الجهاز.
  const markFn = useServerFn(markShiftReviewed);
  // العلامات القديمة المحفوظة في المتصفح تُنقل للقاعدة مرة واحدة تلقائيًا.
  const [marking, setMarking] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const togglePick = (id: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const deletePicked = async () => {
    const ids = [...picked];
    if (!ids.length) return;
    if (!window.confirm(`حذف ${ids.length} شفت وكل سجلاتهم اليدوية؟`)) return;
    setBulkBusy(true);
    try {
      for (const id of ids) {
        await del({ data: { shiftId: id } });
        if (id === selectedId) onDeleted(id);
      }
      setPicked(new Set());
      setSelectMode(false);
    } catch (e: any) {
      window.alert(e?.message || "تعذر حذف بعض الشفتات");
    } finally {
      setBulkBusy(false);
      void q.refetch();
    }
  };
  const archiveFn = useServerFn(archiveEmployeeShifts);
  const archivePicked = async () => {
    const ids = [...picked];
    if (!ids.length) return;
    if (!window.confirm(`أرشفة ${ids.length} شفت؟ هيختفوا من القايمة من غير ما يتمسح أي سجل.`)) return;
    setBulkBusy(true);
    try {
      const res = await archiveFn({ data: { shiftIds: ids } });
      if (!res.ok) throw new Error(res.error);
      if (selectedId && ids.includes(selectedId)) onDeleted(selectedId);
      setPicked(new Set());
      setSelectMode(false);
    } catch (e: any) {
      window.alert(e?.message || "تعذر أرشفة بعض الشفتات");
    } finally {
      setBulkBusy(false);
      void q.refetch();
    }
  };
  const migratedRef = useRef(false);
  useEffect(() => {
    if (!open || !q.isSuccess || migratedRef.current) return;
    migratedRef.current = true;
    try {
      const ids = new Set<string>();
      for (const key of ["mp:admin-checked-shifts:v2", "mp:admin-checked-shifts"]) {
        const raw = window.localStorage.getItem(key);
        if (raw) for (const id of JSON.parse(raw) as string[]) ids.add(id);
      }
      const pending = (q.data ?? []).filter((s) => !s.reviewed && ids.has(s.id)).map((s) => s.id);
      if (pending.length) {
        setMarking((prev) => new Set([...prev, ...pending]));
        void Promise.all(pending.map((id) => markFn({ data: { shiftId: id } })))
          .then(() => void q.refetch())
          .finally(() =>
            setMarking((prev) => {
              const n = new Set(prev);
              for (const id of pending) n.delete(id);
              return n;
            }),
          );
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q.isSuccess]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        dir="rtl"
        align="center"
        className="w-auto max-w-[92vw] border-0 bg-transparent p-0 shadow-none"
      >
        <div className="w-[420px] max-w-[92vw] overflow-hidden rounded-2xl border border-border/40 bg-[oklch(0.115_0_0)] p-3 shadow-2xl">

      {/* Header */}
      <div className="relative mb-3 overflow-hidden rounded-xl bg-[linear-gradient(180deg,#1636e6,#0a24c4)] px-3 py-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_6px_rgba(0,0,0,0.55)]">
        <span className="text-sm font-black text-white">شفتات الموظف</span>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/90">
          رقم الشفت
        </span>
        <button
          type="button"
          onClick={() => {
            setSelectMode((v) => !v);
            setPicked(new Set());
          }}
          title={selectMode ? "إلغاء التحديد" : "تحديد أكثر من شفت للحذف"}
          aria-label="تحديد أكثر من شفت للحذف"
          aria-pressed={selectMode}
          className="absolute left-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg bg-white/15 text-white transition hover:bg-white/25"
        >
          {selectMode ? <X className="size-4" /> : <ListChecks className="size-4" />}
        </button>
      </div>
      {selectMode && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2">
          <span className="text-xs font-bold text-white/80">محدد: {picked.size}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPicked(picked.size === shifts.length ? new Set() : new Set(shifts.map((s) => s.id)))}
              className="rounded-lg bg-white/10 px-2 py-1 text-[11px] font-bold text-white hover:bg-white/20"
            >
              {picked.size === shifts.length && shifts.length ? "إلغاء الكل" : "تحديد الكل"}
            </button>
            <button
              type="button"
              disabled={!picked.size || bulkBusy}
              onClick={() => void archivePicked()}
              title="أرشفة الشفتات المحددة"
              aria-label="أرشفة الشفتات المحددة"
              className="grid size-7 place-items-center rounded-lg bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
            >
              <Archive className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={!picked.size || bulkBusy}
              onClick={() => void deletePicked()}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2 py-1 text-[11px] font-black text-white disabled:opacity-40"
            >
              {bulkBusy ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
              حذف المحدد
            </button>
          </div>
        </div>
      )}

      {q.isLoading ? (
        <Loader2 className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
      ) : shifts.length === 0 ? (
        <p className="py-6 text-center text-xs text-white/50">لا توجد شفتات</p>
      ) : (
        <ul className="scrollbar-hide max-h-[60vh] space-y-2 overflow-y-auto">

          {shifts.map((sh, i) => {
            const active = sh.id === selectedId;
            const start = fmtShift(sh.startedAt);
            const end = sh.endedAt ? fmtShift(sh.endedAt) : null;
            const number = shifts.length - i;
            return (
              <li key={sh.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`حذف «شفت رقم ${number}» وكل سجلاته اليدوية؟`)) return;
                    del({ data: { shiftId: sh.id } })
                      .then(() => {
                        if (sh.id === selectedId) onDeleted(sh.id);
                        void q.refetch();
                      })
                      .catch((e: any) => window.alert(e?.message || "تعذر حذف الشفت"));
                  }}
                  title="حذف الشفت"
                  aria-label="حذف الشفت"
                  className="grid w-9 shrink-0 place-items-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20"
                >
                  <Trash2 className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleShare(sh.id)}
                  title={sharedId === sh.id ? "ظاهر للموظف — اضغط للإخفاء" : "إظهار الشفت للموظف"}
                  aria-label="إظهار الشفت للموظف"
                  aria-pressed={sharedId === sh.id}
                  className={`grid size-6 shrink-0 self-center place-items-center rounded-full border transition ${
                    sharedId === sh.id
                      ? "border-blue-400/60 bg-blue-500/25 text-blue-300"
                      : "border-white/15 bg-white/5 text-white/30 hover:border-white/30 hover:text-white/60"
                  }`}
                >
                  {sharedId === sh.id ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const isOn = sh.reviewed || marking.has(sh.id);
                    if (isOn) return;
                    setMarking((prev) => new Set(prev).add(sh.id));
                    markFn({ data: { shiftId: sh.id } })
                      .then(() => void q.refetch())
                      .catch(() => window.alert("تعذر حفظ علامة المراجعة"))
                      .finally(() =>
                        setMarking((prev) => {
                          const n = new Set(prev);
                          n.delete(sh.id);
                          return n;
                        }),
                      );
                  }}
                  title="تمت المراجعة"
                  aria-label="علامة مراجعة الشفت"
                  aria-pressed={sh.reviewed || marking.has(sh.id)}
                  className={`grid size-6 shrink-0 self-center place-items-center rounded-full border transition ${
                    sh.reviewed || marking.has(sh.id)
                      ? "border-emerald-400/60 bg-emerald-500/25 text-emerald-300"
                      : "border-white/15 bg-white/5 text-white/30 hover:border-white/30 hover:text-white/60"
                  }`}
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    selectMode ? togglePick(sh.id) : onSelect({ ...sh, label: `شفت رقم ${number}` })
                  }
                  aria-pressed={selectMode ? picked.has(sh.id) : undefined}
                  className={`flex flex-1 items-stretch gap-2 rounded-xl border px-2 py-2 text-right transition ${
                    selectMode && picked.has(sh.id)
                      ? "border-rose-500/70 bg-rose-500/10"
                      : active
                      ? "border-blue-500/40 bg-[oklch(0.13_0_0)] shadow-[0_0_20px_-6px_oklch(0.78_0.24_120/0.5)]"
                      : sh.linkGroup && groupColors.has(sh.linkGroup)
                      ? groupColors.get(sh.linkGroup)
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
        </div>
      </PopoverContent>
    </Popover>
  );
}




/**
 * قسم «جدول بيانات الشغل».
 * - واجهة الموظف: كما هي بالكامل (EmployeeWorkView).
 * - واجهة الأدمن: تبويبان (جدول بيانات حر + قسم الموظفين مع sidebar شفتات).
 */
export function WorkSheetPanel({ isAdmin }: { isAdmin: boolean }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  const [selected, setSelected] = useState<Employee | null>(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  if (!isAdmin) return <EmployeeSide />;

  return (
    <div className="min-h-[40vh] -mx-4 md:-mx-6 -mt-4 md:-mt-6" dir="rtl">
      <div className="relative flex min-h-[calc(100vh-80px)] flex-col">
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

        <div className="relative flex items-center justify-start gap-3 px-4 pb-0 pt-4 md:px-6">
          <EmployeePickerMenu
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            selectedId={selected?.user_id ?? null}
            onSelect={(emp) => {
              setSelected(emp);
              setSelectedShift(null);
              setPickerOpen(false);
            }}
          >
            <button type="button" className={`${CHIP_BASE} ${selected ? CHIP_ON : CHIP_OFF}`}>
              قائمة الموظفين
            </button>
          </EmployeePickerMenu>
          <ShiftPickerMenu
            userId={selected?.user_id ?? null}
            selectedId={selectedShift?.id ?? null}
            open={shiftOpen}
            onOpenChange={setShiftOpen}
            onSelect={(sh) => {
              setSelectedShift(sh);
              setShiftOpen(false);
            }}
            onDeleted={() => setSelectedShift(null)}
          >
            <button type="button" className={`${CHIP_BASE} ${selectedShift ? CHIP_ON : CHIP_OFF}`}>
              اختيار الشفت
            </button>
          </ShiftPickerMenu>
          <EmployeePinMenu
            userId={selected?.user_id ?? null}
            open={pinOpen}
            onOpenChange={setPinOpen}
          >
            <button type="button" className={`${CHIP_BASE} ${CHIP_OFF}`}>
              رمز الموظف
            </button>
          </EmployeePinMenu>
        </div>

        <div className="relative flex flex-1 p-4 md:p-6">
          <div className="min-w-0 flex-1">
            <EmployeeWorkView
              isAdmin
              blank={!selectedShift}
              {...(selected ? { viewUserId: selected.user_id } : {})}
              {...(selectedShift ? { viewShiftId: selectedShift.id } : {})}
              viewShift={selectedShift ?? undefined}
              viewName={selected ? selected.full_name || selected.email : undefined}
              viewAvatar={selected?.avatar_signed_url || undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}




/** الموظف يختار الشفت الذي أتاحته الإدارة من قائمة أعلى اليسار. */
function EmployeeSide() {
  const fn = useServerFn(getMySharedShift);
  const q = useQuery({ queryKey: ["my-shared-shift"], queryFn: () => fn(), refetchInterval: 15_000 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const shared = q.data as Shift | null | undefined;
  const selectedShift = shared?.id === selectedId ? shared : null;
  useEffect(() => {
    if (q.isSuccess && (!shared || shared.id !== selectedId)) setSelectedId(null);
  }, [q.isSuccess, shared, selectedId]);
  return (
    <div dir="rtl">
      {shared && (
        <div className="fixed top-4 left-4 z-50">
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button variant="secondary" className="gap-2 border border-border shadow-md">
                <History />
                شفتات سابقة
                <ChevronDown />
              </Button>
            </PopoverTrigger>
            <PopoverContent dir="rtl" align="start" side="bottom" className="w-72 max-w-[calc(100vw-2rem)] p-2">
              <p className="px-2 py-2 text-sm font-semibold">شفتات سابقة</p>
              <div className="max-h-[60vh] overflow-y-auto">
                <Button
                  variant="ghost"
                  className="h-auto w-full justify-between whitespace-normal py-3 text-right"
                  onClick={() => {
                    setSelectedId(shared.id);
                    setMenuOpen(false);
                  }}
                  aria-pressed={selectedId === shared.id}
                >
                  <span className="flex flex-col gap-1">
                    <span>{shared.label ?? "الشفت السابق"}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {fmtShift(shared.startedAt).day} · {fmtShift(shared.startedAt).date} · {fmtShift(shared.startedAt).time}
                    </span>
                  </span>
                  {selectedId === shared.id && <Check className="text-primary" />}
                </Button>
                {selectedShift && (
                  <Button variant="ghost" className="mt-1 w-full border-t border-border" onClick={() => {
                    setSelectedId(null);
                    setMenuOpen(false);
                  }}>
                    رجوع لشفتي
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
      {selectedShift ? (
        <EmployeeWorkView key={selectedShift.id} viewShiftId={selectedShift.id} viewShift={selectedShift} />
      ) : (
        <EmployeeWorkView />
      )}
    </div>
  );
}
