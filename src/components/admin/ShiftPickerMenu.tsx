import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, Check, Eye, EyeOff, ListChecks, Loader2, Trash2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { getEmployeeShiftList, deleteEmployeeShift, getSharedShiftId, setSharedShift, markShiftReviewed, archiveEmployeeShifts } from "@/lib/work.functions";

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

export type Shift = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  open: boolean;
  txns: number;
  reviewed?: boolean;
  label?: string;
  /** Legacy colour group; not evidence of a specific order-to-shift link. */
  linkGroup?: string | null;
  p2pOrderIds?: string[];
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

export const fmtShift = (ms: number) => {
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
export function ShiftPickerMenu({
  userId,
  selectedId,
  onSelect,
  onDeleted,
  onReviewed,
  open,
  onOpenChange,
  children,
}: {
  userId: string | null;
  selectedId: string | null;
  onSelect: (shift: Shift) => void;
  onDeleted: (shiftId: string) => void;
  onReviewed: (shiftId: string) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const listFn = useServerFn(getEmployeeShiftList);
  const del = useServerFn(deleteEmployeeShift);
  const [archivedOnly, setArchivedOnly] = useState(false);
  useEffect(() => { setArchivedOnly(false); }, [userId]);
  const q = useQuery({
    queryKey: ["admin-employee-shifts", userId, archivedOnly],
    queryFn: () => {
      if (!userId) return Promise.resolve([]);
      return listFn({ data: { userId, archivedOnly } }) as Promise<Shift[]>;
    },
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
      window.alert(e?.message || "تعذر حذف بعض الشفتات");    } finally {
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
        void Promise.all(pending.map(async (id) => {
          const result = await markFn({ data: { shiftId: id } });
          if (result.ok) onReviewed(id);
        }))
          .then(() => { void q.refetch(); })
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
        <button
          type="button"
          disabled={archivedOnly || !picked.size || bulkBusy}
          onClick={() => void archivePicked()}
          title="أرشفة الشفتات المحددة"
          aria-label="أرشفة الشفتات المحددة"
          className="absolute left-10 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg bg-white/15 text-white transition hover:bg-white/25 disabled:opacity-40"
        >
          {bulkBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />}
        </button>
      </div>
      <div className="mb-3 flex items-center gap-1" role="group" aria-label="عرض الشفتات">
        <Button size="sm" variant={archivedOnly ? "ghost" : "secondary"} aria-pressed={!archivedOnly}
          disabled={bulkBusy} onClick={() => { setArchivedOnly(false); setPicked(new Set()); setSelectMode(false); }}>
          الشفتات
        </Button>
        <Button size="sm" variant={archivedOnly ? "secondary" : "ghost"} aria-pressed={archivedOnly}
          disabled={bulkBusy} onClick={() => { setArchivedOnly(true); setPicked(new Set()); setSelectMode(false); }}>
          <Archive className="size-4" /> المؤرشفة
        </Button>
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
      ) : q.isError ? (
        <div className="py-4 text-center text-sm text-destructive">
          <p>تعذر تحميل الشفتات</p>
          <Button variant="ghost" size="sm" onClick={() => void q.refetch()}>إعادة المحاولة</Button>
        </div>
      ) : shifts.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">{archivedOnly ? "لا توجد شفتات مؤرشفة" : "لا توجد شفتات"}</p>
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
                      .then((result) => {
                        if (!result.ok) throw new Error(result.error);
                        onReviewed(sh.id);
                        void q.refetch();
                      })
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
                    <span title={sh.linkGroup ? `مجموعة تاريخية: ${sh.linkGroup}` : undefined} className="grid h-8 w-8 place-items-center rounded-lg bg-[linear-gradient(180deg,#1636e6,#0a24c4)] text-sm font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
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
                        </span>                        <span className="text-[11px] font-bold text-blue-300">
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
