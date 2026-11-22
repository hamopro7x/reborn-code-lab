import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandBadge, LedgerRowDetails, statusBadge } from "@/components/admin/BybitLedgerPanel";
import { saveMyTxnEntry } from "@/lib/work.functions";

function last4(detail: Record<string, unknown>) {
  const raw = String(
    detail["pan4"] ??
      detail["cardNo"] ??
      detail["cardNumber"] ??
      detail["maskedCardNo"] ??
      detail["pan"] ??
      "",
  ).replace(/\D/g, "");
  return raw ? raw.slice(-4) : "—";
}
/** Card mark + last 4 digits. The brand comes from the main account card * records (pan4 -> brand reference map), never chosen by hand. */
export function Last4Cell({
  detail,
  brands,
}: {
  detail: Record<string, unknown>;
  brands: Record<string, string>;
}) {
  const digits = last4(detail);
  const brand = String(
    brands[digits] ?? detail["cardBrand"] ?? detail["brand"] ?? detail["cardType"] ?? "",
  );
  return (
    <span className="flex items-center justify-center gap-2">
      <BrandBadge brand={brand} />
      <span className="tabular-nums">{digits}</span>
    </span>
  );
}

/** «المعاملات» in the employee view = card (visa) transactions only. */
export const isCardTxn = (kind: unknown) => /^(card|refund)$/i.test(String(kind ?? ""));

/** 10-minute edit window, measured against the SERVER clock (a client clock
 *  that is wrong or tampered with cannot widen it — the server re-checks too). */
const EDIT_WINDOW_MS = 5 * 60 * 1000;

function useEditWindow(savedAt: string | null | undefined, serverNow: string | null | undefined) {
  const skewRef = useRef(0);
  useEffect(() => {
    if (serverNow) skewRef.current = new Date(serverNow).getTime() - Date.now();
  }, [serverNow]);

  const expired = () => {
    if (!savedAt) return false;
    return Date.now() + skewRef.current - new Date(savedAt).getTime() >= EDIT_WINDOW_MS;
  };
  const [locked, setLocked] = useState(expired);
  useEffect(() => {
    setLocked(expired());
    if (!savedAt) return;
    const t = window.setInterval(() => setLocked(expired()), 5000);
    return () => window.clearInterval(t);
  }, [savedAt, serverNow]);
  return locked;
}

/** One employee-entered cell: saved on blur/Enter, editable for 10 minutes
 *  after the server-side save time, then permanently locked (🔒). */
export function EntryCell({
  row,
  field,
  serverNow,
  onSaved,
  readOnly,
}: {
  row: any;
  field: "egp" | "quantity";
  serverNow?: string | null;
  onSaved: () => void;
  readOnly?: boolean;
}) {
  const saveFn = useServerFn(saveMyTxnEntry);
  const saved = row[field];
  const savedAt = (field === "egp" ? row.egpAt : row.quantityAt) ?? null;
  const locked = useEditWindow(savedAt, serverNow) || !!readOnly;
  const initial = saved === null || saved === undefined ? "" : String(saved);
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const sentRef = useRef(initial);

  // Keep the input in sync with the freshest server value (query refetch).
  useEffect(() => {
    setValue(initial);
    sentRef.current = initial;
  }, [initial]);

  const commit = (raw: string) => {
    const txt = String(raw).replace(/,/g, "").trim();
    if (!txt || txt === sentRef.current) return;
    const n = Number(txt);
    if (!Number.isFinite(n) || n < 0) return;
    sentRef.current = txt;
    setBusy(true);
    void saveFn({ data: { ledgerId: row.ledgerId, field, value: n } })
      .then((res: any) => {
        if (res?.ok) {
          toast.success("تم الحفظ");
          onSaved();
        } else {
          sentRef.current = initial;
          toast.error(String(res?.error ?? "تعذر الحفظ"));
          onSaved();
        }
      })
      .catch((e) => {
        sentRef.current = initial;
        toast.error(e instanceof Error ? e.message : "تعذر الحفظ");
      })
      .finally(() => setBusy(false));
  };

  if (locked) {
    return (
      <span
        title="انتهت مدة التعديل المسموحة لهذه القيمة."
        className="inline-flex items-center justify-center gap-1 tabular-nums"
      >
        {saved === null || saved === undefined
          ? "—"
          : Number(saved).toLocaleString("en-US", { maximumFractionDigits: 4 })}
        
      </span>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <input
        inputMode="decimal"
        data-no-autosave
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => commit(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-8 w-20 border-0 bg-transparent px-2 text-center text-xs tabular-nums outline-none focus:bg-white/5"
      />
      {busy ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}



/** Original transaction details, rendered exactly like the central ledger. */
export function TxnDetailsDialog({ row, onClose }: { row: any | null; onClose: () => void }) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent dir="rtl" className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تفاصيل المعاملة الأصلية</DialogTitle>
        </DialogHeader>
        {row ? (
          <LedgerRowDetails
            row={{ ...row, id: row.ledgerId, refId: row.refId ?? "—" }}
            badgeText={statusBadge(String(row.kind), String(row.status ?? "")).text}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

