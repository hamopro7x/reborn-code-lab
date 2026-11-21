import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, History } from "lucide-react";
import { EmployeePinMenu } from "@/components/admin/EmployeePinMenu";
import { EmployeeWorkView } from "@/components/admin/EmployeeWorkView";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { getMySharedShift } from "@/lib/work.functions";
import employeesBg from "@/assets/employees-bg.png.asset.json";
import { livePoll } from "@/lib/live-poll";

/** ألوان مجموعات ربط P2P — الشفتات اللي اتربطو بنفس الطلب تاخد لون واحد، وكل مجموعة لون مختلف. */
const CHIP_BASE =
  "inline-flex flex-row-reverse items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold text-white transition";
const CHIP_ON =
  "bg-[#1a1a1a] text-blue-300 shadow-[0_0_20px_-4px_oklch(0.78_0.24_120/0.7),0_0_0_1px_oklch(0.78_0.24_120/0.5)] ring-1 ring-blue-500/40";
const CHIP_OFF =
  "bg-[#0d0d0d] opacity-80 shadow-[0_6px_20px_-6px_rgba(0,0,0,0.9)] hover:opacity-95 hover:ring-1 hover:ring-blue-500/20";

import { EmployeePickerMenu, ShiftPickerMenu, type Employee, type Shift } from "@/components/admin/WorkSheetPickers";

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
            onReviewed={(id) => setSelectedShift((current) => current?.id === id ? { ...current, reviewed: true } : current)}
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
  const q = useQuery({ queryKey: ["my-shared-shift"], queryFn: () => fn(), refetchInterval: livePoll(15_000) });
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