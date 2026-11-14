import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getMyShiftsForLink, linkP2POrder, setMyP2PShiftHidden } from "@/lib/work.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateTime } from "@/lib/format";

export function P2PShiftLinkMenu({ ledgerId, onLinked }: { ledgerId: string; onLinked?: () => void }) {
  const getShifts = useServerFn(getMyShiftsForLink);
  const link = useServerFn(linkP2POrder);
  const setHidden = useServerFn(setMyP2PShiftHidden);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const mine = useQuery({
    queryKey: ["work-my-shifts-link", false],
    queryFn: () => getShifts({ data: {} }),
    enabled: open,
  });
  useEffect(() => { setSelected(new Set()); }, [open]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["work-my-shifts-link"] });
  const saveVisibility = async (shiftId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await setHidden({ data: { shiftId, hidden: true } });
      if (!result.ok) { toast.error(result.error); return; }
      setSelected((previous) => { const next = new Set(previous); next.delete(shiftId); return next; });
      await qc.cancelQueries({ queryKey: ["work-my-shifts-link"] });
      qc.setQueriesData<NonNullable<typeof mine.data>>({ queryKey: ["work-my-shifts-link"] }, (previous) => previous ? {
        ...previous, shifts: previous.shifts.filter((shift) => shift.id !== shiftId),
      } : previous);
      await refresh();
      toast.success("تم إخفاء الشفت من قائمة الربط");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الاختيار"); }
    finally { setBusy(false); }
  };
  const linkSelected = async () => {
    const available = new Set((mine.data?.shifts ?? []).map((s) => s.id));
    const shiftIds = [...selected].filter((id) => available.has(id));
    if (busy || !shiftIds.length) return;
    setBusy(true);
    try {
      const result = await link({ data: { ledgerId, shiftIds } });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("تم ربط الطلب بكل الشفتات المحددة");
      setOpen(false);
      onLinked?.();
      void qc.invalidateQueries({ queryKey: ["admin-employee-shifts"] });
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الربط"); }
    finally { setBusy(false); }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="outline" size="sm">ربط</Button></PopoverTrigger>
      <PopoverContent dir="rtl" className="w-[420px] max-w-[92vw] p-0" align="center">
        <div className="data-table-head px-3 py-2 text-center text-xs font-bold">شفتات {mine.data?.name ?? "الموظف"}</div>
        <div className="max-h-72 overflow-y-auto">
          {mine.isPending ? <Loader2 className="mx-auto my-4 size-4 animate-spin" /> : mine.isError ? (
            <div className="p-3 text-xs text-destructive" role="alert">{mine.error.message}<Button size="sm" variant="ghost" onClick={() => void mine.refetch()}>إعادة المحاولة</Button></div>
          ) : mine.data.shifts.length ? (
            <table className="data-table w-full text-right text-xs">
              <thead><tr><th className="w-8">✓</th><th>الحالة</th><th>الشفت</th><th>الإجراء</th></tr></thead>
              <tbody>{mine.data.shifts.map((shift) => (
                <tr key={shift.id}>
                  <td className="p-2"><Checkbox aria-label={`اختيار شفت ${formatDateTime(shift.startedAt)}`} checked={selected.has(shift.id)} disabled={busy || (!selected.has(shift.id) && selected.size >= 100)} onCheckedChange={(checked) => setSelected((previous) => {
                    const next = new Set(previous); if (checked === true) next.add(shift.id); else next.delete(shift.id); return next;
                  })} /></td>
                  <td className="p-2">{shift.endedAt ? "منتهي" : "مفتوح"}</td>
                  <td className="p-2 text-xs tabular-nums">{formatDateTime(shift.startedAt)}</td>
                  <td className="p-2"><Button size="sm" variant="ghost" disabled={busy} onClick={() => void saveVisibility(shift.id)}><EyeOff />إخفاء</Button></td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="py-4 text-center text-xs text-muted-foreground">لا توجد شفتات</p>}
        </div>
        <div className="border-t border-border p-2 text-center"><Button size="sm" disabled={busy || !selected.size || mine.isError} onClick={() => void linkSelected()}>{busy && <Loader2 className="animate-spin" />}ربط ({selected.size})</Button></div>
      </PopoverContent>
    </Popover>
  );
}