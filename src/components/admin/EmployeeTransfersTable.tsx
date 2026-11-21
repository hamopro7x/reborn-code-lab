import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveTransferNote } from "@/lib/work.functions";
import { statusBadge } from "@/components/admin/BybitLedgerPanel";
import { num, fmtShiftDate } from "@/components/admin/EmployeeWorkFormatters";

const TRANSFER_COLUMNS = [
  "النوع",
  "الفيزا",
  "المبلغ",
  "التاريخ / الوقت",
  "الحالة",
  "معرّف المعاملة",
  "الإجراء",
];

const TRANSFER_LABEL: Record<string, string> = {
  deposit: "إيداع خارجي",
  withdraw: "سحب خارجي",
  internal_in: "إيداع داخلي",
  internal_out: "سحب داخلي",
};

/** كبسولة إيداع/سحب بنفس شكل القسم المركزي. */
export function FlowChip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
        active
          ? "border-blue-500/40 bg-blue-500/15 text-blue-400"
          : "border-border/40 text-muted-foreground hover:border-blue-500/30 hover:text-foreground"
      }`}    >      {children}
    </button>
  );
}

/** نافذة تعديل 10 دقائق لخانة «تحويل الي» (السيرفر يعيد التحقق أيضًا). */
function useNoteEditWindow(savedAt: string | null | undefined) {
  const expired = () =>
    !!savedAt && Date.now() - new Date(savedAt).getTime() >= 10 * 60 * 1000;
  const [locked, setLocked] = useState(expired);
  useEffect(() => {
    setLocked(expired());
    if (!savedAt) return;
    const t = window.setInterval(() => setLocked(expired()), 5000);
    return () => window.clearInterval(t);
  }, [savedAt]);
  return locked;
}

/** خانة «تحويل الي» — يكتبها الموظف يدويًا (حروف/أرقام/رموز) وتُقفل بعد 10 دقائق. */
function TransferNoteCell({ row, onSaved, readOnly }: { row: any; onSaved: () => void; readOnly?: boolean }) {
  const saveFn = useServerFn(saveTransferNote);
  const savedAt = row.noteAt ?? null;
  const locked = useNoteEditWindow(savedAt) || !!readOnly;
  const initial = row.note ? String(row.note) : "";
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const sentRef = useRef(initial);

  useEffect(() => {
    setValue(initial);
    sentRef.current = initial;
  }, [initial]);

  const commit = (raw: string) => {
    const txt = String(raw).trim();
    if (!txt || txt === sentRef.current) return;
    sentRef.current = txt;
    setBusy(true);
    void saveFn({ data: { ledgerId: row.ledgerId, note: txt } })
      .then((res: any) => {
        if (res?.ok) toast.success("تم الحفظ");
        else {
          sentRef.current = initial;
          toast.error(String(res?.error ?? "تعذر الحفظ"));
        }
        onSaved();
      })
      .catch((e: unknown) => {
        sentRef.current = initial;
        toast.error(e instanceof Error ? e.message : "تعذر الحفظ");
      })
      .finally(() => setBusy(false));
  };

  if (locked) {
    return (
      <span title="انتهت مدة التعديل المسموحة لهذه الخانة." className="text-xs">
        {initial || "—"}
      </span>
    );
  }
  return (
    <div className="flex items-center justify-center gap-1">
      <input
        data-no-autosave
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => commit(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-8 w-32 rounded-lg border border-border/60 bg-background/60 px-2 text-center text-xs outline-none focus:border-[oklch(0.62_0.18_250)]"
      />
      {busy ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}

export function TransfersTable({
  rows,
  loading,
  onDetails,
  noteColumn,
  onSaved,
  readOnly,
}: {
  rows: any[];
  loading?: boolean;
  onDetails: (row: any) => void;
  noteColumn?: boolean;
  onSaved?: () => void;
  readOnly?: boolean;
}) {
  const emptyRows = Math.max(10 - rows.length, 0);
  const columns = noteColumn
    ? TRANSFER_COLUMNS.map((c) => (c === "معرّف المعاملة" ? "تحويل الي" : c))
    : TRANSFER_COLUMNS;
  return (
    <div className="data-surface">
      <div className="overflow-x-auto">
        <table className="data-table min-w-[900px] text-center">

          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="py-8">
                  <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const isIn = String(r.direction) === "in";
                const badge = statusBadge(String(r.kind), String(r.status ?? ""));
                return (
                  <tr key={String(r.ledgerId)}>
                    <td className="font-bold">
                      <span className={isIn ? "text-emerald-400" : "text-destructive"}>
                        {TRANSFER_LABEL[String(r.kind)] ?? String(r.kind)}
                      </span>
                    </td>
                    <td className="text-xs">{String(r.accountName ?? "—")}</td>
                    <td className="tabular-nums" dir="ltr">
                      <div className="font-bold">
                        {num(Math.abs(Number(r.amount)))} {String(r.currency ?? "")}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{String(r.title ?? "")}</div>
                    </td>
                    <td className="text-xs text-muted-foreground tabular-nums">{txnTime(Number(r.time))}</td>
                    <td>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </td>
                    {noteColumn ? (
                      <td>
                        <TransferNoteCell row={r} onSaved={() => onSaved?.()} readOnly={readOnly} />
                      </td>
                    ) : (
                      <td className="text-[11px] text-muted-foreground" dir="ltr">
                        {String(r.refId ?? "—") || "—"}
                      </td>
                    )}
                    <td>
                      <button type="button" onClick={() => onDetails(r)} className="table-btn mx-auto">
                        التفاصيل
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
            {Array.from({ length: emptyRows }).map((_, i) => (
              <tr key={`tr-empty-${i}`}>
                {columns.map((c) => (
                  <td key={c}>&nbsp;</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function txnTime(ms: number) {
  const date = fmtShiftDate(ms);
  return `${date.day} - ${date.date} - ${date.time}`;
}
