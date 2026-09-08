/**
 * Admin control for an employee's 6-digit handover PIN: set a new one, or
 * clear it so the employee creates their own on the next handover.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { clearEmployeePin, getEmployeePinStatus, setEmployeePin } from "@/lib/work.functions";

export function EmployeePinMenu({
  userId,
  open,
  onOpenChange,
  children,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const statusFn = useServerFn(getEmployeePinStatus);
  const saveFn = useServerFn(setEmployeePin);
  const clearFn = useServerFn(clearEmployeePin);
  const qc = useQueryClient();

  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const status = useQuery({
    queryKey: ["employee-pin-status", userId],
    queryFn: () => statusFn({ data: { userId: userId! } }) as Promise<{ hasPin: boolean }>,
    enabled: open && !!userId,
  });

  async function save() {
    if (!userId || pin.length !== 6) {
      toast.error("اكتب 6 أرقام");
      return;
    }
    setBusy(true);
    try {
      const res = (await saveFn({ data: { userId, pin } })) as { ok: boolean; error?: string };
      if (!res.ok) toast.error(res.error ?? "تعذّر حفظ الرمز");
      else {
        toast.success("تم تعيين الرمز");
        setPin("");
        void qc.invalidateQueries({ queryKey: ["employee-pin-status", userId] });
      }
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!userId) return;
    setBusy(true);
    try {
      const res = (await clearFn({ data: { userId } })) as { ok: boolean; error?: string };
      if (!res.ok) toast.error(res.error ?? "تعذّر تصفير الرمز");
      else {
        toast.success("تم تصفير الرمز — الموظف سينشئ رمزًا جديدًا");
        void qc.invalidateQueries({ queryKey: ["employee-pin-status", userId] });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        dir="rtl"
        align="center"
        className="w-auto max-w-[92vw] border-0 bg-transparent p-0 shadow-none"
      >
        <div className="w-[300px] overflow-hidden rounded-xl border border-border/50 bg-[oklch(0.135_0_0)] shadow-2xl">
          <div className="data-table-head truncate px-3 py-1.5 text-center text-[11px] font-bold">
            رمز استلام الشغل
          </div>
          <div className="space-y-3 p-3">
            {!userId ? (
              <p className="p-2 text-center text-xs text-white/60">اختر الموظف أولاً</p>
            ) : (
              <>
                <p className="text-center text-[11px] font-bold text-white/70">
                  {status.isLoading
                    ? "..."
                    : status.data?.hasPin
                      ? "الموظف لديه رمز حاليًا"
                      : "لا يوجد رمز — الموظف سينشئ رمزه"}
                </p>
                <Input
                  dir="ltr"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => {
                    if (/^\d*$/.test(e.target.value)) setPin(e.target.value.slice(0, 6));
                  }}
                  placeholder="******"
                  className="h-11 text-center text-xl font-black tracking-[0.4em]"
                />
                <Button
                  className="w-full gap-2 text-xs font-black"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                  تعيين الرمز
                </Button>
                <Button
                  variant="secondary"
                  className="w-full gap-2 text-xs font-black"
                  disabled={busy || !status.data?.hasPin}
                  onClick={() => void reset()}
                >
                  <RotateCcw className="size-4" />
                  تصفير الرمز
                </Button>
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
