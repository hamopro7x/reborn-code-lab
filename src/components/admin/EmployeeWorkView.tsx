/**
 * Employee execution view — visual design is fixed by the approved reference:
 * black surface with blue neon accents, a top section bar, a horizontal shift
 * strip, the shift's inner section bar, then the transactions grid.
 *
 * Data is real: it comes from the employee's own open shift only.
 *
 * Column ownership is strict:
 *  - "آخر 4 أرقام للبطاقة" and "الإجراء" (details) come from the ORIGINAL
 *    transaction row in the central ledger, matched by its ledger id.
 *  - "جنيه" and "الكمية" are entered by the employee, saved automatically on
 *    blur, then locked for good (enforced on the server).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  User,
  Clock,
  ScanFace,
  ListOrdered,
  AlertTriangle,
  ArrowLeftRight,
  ArrowDownUp,

  Users,
  Settings,
  CreditCard,
  CalendarClock,
  Package,
  DollarSign,
  Wallet,
  Trash2,
  

} from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyWorkState,
  getMyShiftTxns,
  saveMyTxnEntry,
  saveTransferNote,
  getMyManualTxns,
  addMyManualTxn,
  saveMyManualTxn,
  clearMyManualTxns,
  getWorkP2PCompleted,
  getWorkTransfers,

  getMyShiftsForLink,
  linkP2POrder,
  getEmployeeWorkState,
  getEmployeeShiftTxns,
  getEmployeeManualTxns,

} from "@/lib/work.functions";
import { useFaceClaim } from "@/components/admin/FaceGate";
import { getViewerIdentity } from "@/lib/courses.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getBybitCardBrands } from "@/lib/bybit.functions";
import { BrandBadge, LedgerRowDetails, statusBadge } from "@/components/admin/BybitLedgerPanel";

type ManualKind = "wrong" | "employee" | "receive" | "transfer";

type TabKey = "p2p" | "transfers" | "wrong" | "week" | "all" | "employee" | "ext" | "int";

/** DOM order = right-to-left order in the reference. */
const TOP_TABS: { key: TabKey; label: string; icon: typeof ListOrdered }[] = [
  { key: "all", label: "المعاملات", icon: ListOrdered },
  { key: "ext", label: "الإيداع والسحب الخارجي", icon: ArrowDownUp },
  { key: "int", label: "الإيداع والسحب الداخلي", icon: ArrowLeftRight },
  { key: "wrong", label: "المعاملات الغلط والخاص بالموظف", icon: AlertTriangle },
  { key: "transfers", label: "الاستلم من والتحويل الي", icon: ArrowLeftRight },
  { key: "p2p", label: "طليات P2P", icon: Users },
];



const COLUMNS: { label: string; icon: typeof ListOrdered }[] = [
  { label: "اسم التاجر", icon: User },
  { label: "إجمالي المبلغ", icon: Wallet },
  { label: "جنية", icon: DollarSign },
  { label: "الكمية", icon: Package },
  { label: "تاريخ وقت المعاملة", icon: CalendarClock },
  { label: "آخر 4 أرقام للبطاقة", icon: CreditCard },
  { label: "الإجراء", icon: Settings },
];

const GLOW_ACTIVE =
  "border-[oklch(0.55_0.14_255)] bg-[linear-gradient(180deg,oklch(0.34_0.12_258),oklch(0.26_0.09_258))] text-[oklch(0.96_0.01_255)] shadow-[0_0_0_1px_oklch(0.55_0.14_255/0.35)]";
const GLOW_IDLE =
  "border-border/40 bg-[oklch(0.11_0.02_270)] text-foreground/75 hover:border-[oklch(0.45_0.1_258)] hover:text-foreground/90";

/** Split-pill content for the merged "wrong + employee" tab — side by side. */
function SplitTabContent({ reversed }: { reversed?: boolean }) {
  const own = (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-[oklch(0.66_0.19_25)]">
      <span>الخاص بالموظف</span>
      <User className="size-3.5 shrink-0 text-current/80" />
    </span>
  );
  const wrong = (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span>المعاملات الغلط</span>
      <AlertTriangle className="size-3.5 shrink-0" />
    </span>
  );
  return (
    <span className="flex flex-row items-center gap-2.5">
      {reversed ? wrong : own}
      <span className="inline-block h-4 w-px bg-current/25" />
      {reversed ? own : wrong}
    </span>
  );
}

/* ------------------------- P2P orders table (طلبات P2P) -------------------------
 * Same look as the approved reference: blue pill header row, buy/sell toggle,
 * dark rows with green side + gold owner link. Presentation only. */
const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];


const P2P_COLUMNS = [
  "النوع",
  "التاريخ / الوقت",
  "السعر",
  "المبلغ / الكمية",
  "الطرف المقابل",
  "الحالة",
  "صاحب الطلب",
];

/** Shift picker for the current employee only — no employee selection step. */
function P2PLinkMenu({ ledgerId, onLinked }: { ledgerId: string; onLinked?: () => void }) {
  const myShiftsFn = useServerFn(getMyShiftsForLink);
  const linkFn = useServerFn(linkP2POrder);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const mine = useQuery({
    queryKey: ["work-my-shifts-link"],
    queryFn: () => myShiftsFn({ data: undefined as any }),
    enabled: open,
  });

  const myName = (mine.data as any)?.name ?? "";
  const shiftRows = ((mine.data as any)?.shifts ?? []) as any[];

  const link = async (shiftId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res: any = await linkFn({ data: { ledgerId, shiftId } });
      if (res?.ok) toast.success("تم ربط الطلب بالشفت");
      else toast.error(res?.error ?? "هذا الطلب تم ربطه بالفعل.");
      setOpen(false);
      void mine.refetch();
      onLinked?.();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الربط");
      onLinked?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-full border border-[oklch(0.82_0.15_85/0.5)] bg-[oklch(0.82_0.15_85/0.12)] px-4 py-1 text-xs font-bold text-[oklch(0.82_0.15_85)] transition hover:bg-[oklch(0.82_0.15_85/0.22)]"
        >
          ربط
        </button>
      </PopoverTrigger>
      <PopoverContent
        dir="rtl"
        align="center"
        className="w-auto max-w-[92vw] border-0 bg-transparent p-0 shadow-none"
      >
        <div className="w-[330px] overflow-hidden rounded-xl border border-border/50 bg-[oklch(0.135_0_0)] shadow-2xl">
          <div className="data-table-head truncate px-3 py-1.5 text-center text-[11px] font-bold">
            شفتات {myName || "الموظف"}
          </div>
          <div className="max-h-52 overflow-y-auto">
            {mine.isLoading ? (
              <Loader2 className="mx-auto my-4 size-4 animate-spin text-muted-foreground" />
            ) : shiftRows.length ? (
              <table className="data-table w-full text-right">
                <thead className="data-table-head">
                  <tr>
                    <th className="w-10 px-2 py-1 text-[10px]">#</th>
                    <th className="px-2 py-1 text-[10px]">الحالة</th>
                    <th className="px-2 py-1 text-[10px]">الشفت</th>
                    <th className="w-14 px-2 py-1 text-[10px]">ربط</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftRows.map((s, i) => {
                    const d = new Date(s.startedAt);
                    const p = (n: number) => String(n).padStart(2, "0");
                    const h24 = d.getHours();
                    const h = ((h24 + 11) % 12) + 1;
                    return (
                      <tr key={s.id} className="hover:bg-white/5">
                        <td className="px-2 py-0.5 text-[10px] font-bold tabular-nums">{i + 1}</td>
                        <td className="px-2 py-0.5 text-[10px] font-bold">
                          {s.endedAt ? "منتهي" : "مفتوح"}
                        </td>
                        <td className="px-2 py-0.5 text-[10px] leading-4 text-muted-foreground">
                          <span className="flex items-center gap-1.5 font-bold text-foreground">
                            <span
                              title={s.hasP2P ? "تم ربط طلب P2P بهذا الشفت" : "لم يتم ربط أي طلب بهذا الشفت"}
                              className={`inline-block size-2 shrink-0 rounded-full ${
                                s.hasP2P
                                  ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                                  : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]"
                              }`}
                            />
                            {AR_DAYS[d.getDay()]}
                          </span>
                          <span className="block tabular-nums">
                            {`${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} - ${p(h)}:${p(d.getMinutes())} ${h24 < 12 ? "ص" : "م"}`}
                          </span>
                        </td>
                        <td className="px-2 py-0.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => link(s.id)}
                            className="rounded-full border border-[oklch(0.82_0.15_85/0.5)] bg-[oklch(0.82_0.15_85/0.12)] px-2 py-0.5 text-[10px] font-bold text-[oklch(0.82_0.15_85)] transition hover:bg-[oklch(0.82_0.15_85/0.22)] disabled:opacity-50"
                          >
                            ربط
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="py-4 text-center text-[11px] text-muted-foreground">لا توجد شفتات</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}


function P2POrdersTable({
  rows,
  loading,
  onDetails,
  onLinked,
}: {
  rows: any[];
  loading?: boolean;
  onDetails: (row: any) => void;
  onLinked?: () => void;
}) {
  const emptyRows = Math.max(8 - rows.length, 0);

  return (
    <div className="data-surface">
      <div className="overflow-x-auto">
        <table className="data-table min-w-[900px] text-center">
          <thead>
            <tr>
              {P2P_COLUMNS.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={P2P_COLUMNS.length} className="py-8">
                  <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const d = (r.detail ?? {}) as Record<string, unknown>;
                const badge = statusBadge(String(r.kind), String(r.status ?? ""));
                const fiat = String(d["fiat"] ?? "");
                const isSell = /sell/i.test(String(r.kind));
                return (
                  <tr key={r.assignmentId ?? r.ledgerId}>
                    <td className="font-bold">
                      <span className={isSell ? "text-destructive" : "text-emerald-400"}>
                        {isSell ? "بيع" : "شراء"}
                      </span>{" "}
                      <span>{String(r.currency ?? "USDT")}</span>
                    </td>
                    <td className="text-xs text-muted-foreground tabular-nums">{formatDateTime(r.time)}</td>
                    <td className="tabular-nums" dir="ltr">
                      {d["price"] ? `${fiat} ${d["price"]}` : "—"}
                    </td>
                    <td className="tabular-nums" dir="ltr">
                      <div className="font-bold">{d["fiatAmount"] ? `${fiat} ${d["fiatAmount"]}` : "—"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {String(r.currency ?? "")} {num(Math.abs(Number(r.amount)))}
                      </div>
                    </td>
                    <td className="text-xs">{String(d["counterparty"] ?? "—") || "—"}</td>
                    <td>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </td>
                    <td>
                      <P2PLinkMenu ledgerId={String(r.ledgerId)} onLinked={onLinked} />
                    </td>

                  </tr>
                );
              })
            )}
            {Array.from({ length: emptyRows }).map((_, i) => (
              <tr key={`p2p-empty-${i}`}>
                {P2P_COLUMNS.map((c) => (
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

/* ------- الإيداع والسحب الخارجي / الداخلي (read-only ledger filter) -------
 * Same central transactions used by «معاملات الفيزا»: nothing is created here,
 * the rows are the ORIGINAL ledger rows filtered by their real kind. */
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
function FlowChip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
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
      }`}
    >
      {children}
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

function TransfersTable({
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





function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}


function clockParts(d: Date) {
  const h24 = d.getHours();
  const h = ((h24 + 11) % 12) + 1;
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    time: `${p(h)}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
    ampm: h24 < 12 ? "صباح" : "مساء",
    date: `${AR_DAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`,
  };
}

function txnTime(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  const h24 = d.getHours();
  const h = ((h24 + 11) % 12) + 1;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(h)}:${p(d.getMinutes())} ${h24 < 12 ? "ص" : "م"}`;
}

const num = (n: number, digits = 2) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * Card last 4 digits, taken from the ORIGINAL transaction payload stored with
 * the ledger row (pan4 as reported by the card account itself).
 */
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

/** Card mark + last 4 digits. The brand comes from the main account card
 * records (pan4 -> brand reference map), never chosen by hand. */
function Last4Cell({
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
const isCardTxn = (kind: unknown) => /^(card|refund)$/i.test(String(kind ?? ""));

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
function EntryCell({
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
        className="h-8 w-20 rounded-lg border border-border/60 bg-background/60 px-2 text-center text-xs tabular-nums outline-none focus:border-[oklch(0.62_0.18_250)]"
      />
      {busy ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}



/** Original transaction details, rendered exactly like the central ledger. */
function TxnDetailsDialog({ row, onClose }: { row: any | null; onClose: () => void }) {
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

/* ---------------- «المعاملات الغلط» + «خاص بالموظف» (manual) ---------------- */

/** One manual cell: saved to the database immediately on blur/Enter, editable
 *  for 10 minutes after the server-side save time, then locked (🔒). */
function ManualCell({
  id,
  field,
  initial,
  savedAt,
  serverNow,
  numeric,
  autoFocus,
  onSaved,
  readOnly,
}: {
  id: string;
  field: "amount" | "details";
  initial: string;
  savedAt: string | null;
  serverNow?: string | null;
  numeric?: boolean;
  autoFocus?: boolean;
  onSaved: () => void;
  readOnly?: boolean;
}) {
  const saveFn = useServerFn(saveMyManualTxn);
  const locked = useEditWindow(savedAt, serverNow) || !!readOnly;
  const [value, setValue] = useState(initial);
  const savedRef = useRef(initial);
  const valueRef = useRef(initial);

  // Always show the freshest value coming back from the database.
  useEffect(() => {
    setValue(initial);
    savedRef.current = initial;
    valueRef.current = initial;
  }, [initial]);

  const flush = (v: string) => {
    if (v === savedRef.current) return;
    savedRef.current = v;
    void saveFn({ data: { id, field, value: v } })
      .then((res: any) => {
        if (res && res.ok === false) {
          savedRef.current = "\u0000";
          toast.error(String(res.error ?? "تعذر الحفظ"));
        }
        // Refresh from the DB only after the save resolved (no race).
        onSaved();
      })
      .catch(() => {
        savedRef.current = "\u0000";
        toast.error("تعذر الحفظ، حاول مرة أخرى");
      });
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Save pending edits when the section unmounts, or when the tab/window
  // is hidden or closed — otherwise a fast "type then leave" loses the value.
  useEffect(() => {
    const onHide = () => flushRef.current(valueRef.current);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      flushRef.current(valueRef.current);
    };
  }, []);

  // «المبلغ» accepts digits (incl. Arabic-Indic) and one decimal point only;
  // «التفاصيل» is free text (letters, numbers, symbols, spaces) and optional.
  const clean = (raw: string) => {
    if (!numeric) return raw;
    const latin = raw
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[\u066b\u060c,]/g, ".")
      .replace(/[^\d.]/g, "");
    const [head, ...rest] = latin.split(".");
    return rest.length ? `${head}.${rest.join("")}` : head ?? "";
  };

  if (locked) {
    return (
      <div
        title="انتهت مدة التعديل المسموحة لهذه القيمة."
        className={`flex h-full w-full items-center gap-1 px-3 py-2.5 text-xs text-foreground/90 ${
          numeric ? "justify-center tabular-nums" : "justify-end text-right"
        }`}
      >
        <span>{value}</span>
      </div>
    );
  }

  return (
    <input
      data-no-autosave
      autoFocus={autoFocus}
      inputMode={numeric ? "decimal" : "text"}
      value={value}
      onChange={(e) => setValue(clean(e.target.value))}
      onBlur={(e) => flush(clean(e.target.value))}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={`h-full w-full border-0 bg-transparent px-3 py-2.5 text-xs text-foreground/90 outline-none placeholder:text-transparent ${
        numeric ? "text-center tabular-nums" : "text-right"
      }`}
    />
  );
}


function ManualCard({
  card,
  title,
  rows,
  serverNow,
  onAdd,
  onClear,
  onSaved,
  adding,
  clearing,
  newestId,
  isAdmin,
  readOnly,
}: {
  card: ManualKind;
  title: string;
  rows: {
    id: string;
    amount: string;
    details: string;
    createdAt?: string;
    amountSavedAt?: string | null;
    detailsSavedAt?: string | null;
  }[];
  serverNow?: string | null;
  onAdd: (card: ManualKind) => void;
  onClear: (card: ManualKind) => void;
  onSaved: () => void;
  adding: boolean;
  clearing: boolean;
  newestId: string | null;
  isAdmin: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="data-surface">
      <div className="data-table-head relative flex items-center justify-center px-3 py-3">
        <span className="text-sm font-black">{title}</span>
        <div className="absolute left-3 flex items-center gap-2">
          {!readOnly && isAdmin && rows.length > 0 && (
            <button
              type="button"
              onClick={() => onClear(card)}
              disabled={clearing}
              className="table-btn disabled:opacity-60"
              title="تصفير الصفوف (أدمن فقط)"
            >
              {clearing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Trash2 className="size-3 text-destructive" />
              )}
              <span className="whitespace-nowrap">تصفير</span>
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => onAdd(card)}
              disabled={adding}
              className="table-btn disabled:opacity-60"
            >
              <span className="grid size-4 place-items-center rounded-full bg-[oklch(0.5_0.14_255)] text-[11px] leading-none text-[oklch(0.98_0_0)]">
                {adding ? <Loader2 className="size-2.5 animate-spin" /> : "+"}
              </span>
              <span className="whitespace-nowrap">إضافة معاملة جديدة</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[520px] min-h-[520px] overflow-y-auto overflow-x-hidden scrollbar-hide">
        <table className="data-table text-center">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-[24%]">المبلغ</th>
              <th>التفاصيل</th>
              <th className="w-[34%]">التاريخ والوقت</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="!p-0">
                  <ManualCell
                    id={r.id}
                    field="amount"
                    initial={r.amount}
                    savedAt={r.amountSavedAt ?? null}
                    serverNow={serverNow}
                    numeric
                    autoFocus={!readOnly && r.id === newestId}
                    onSaved={onSaved}
                    readOnly={readOnly}
                  />
                </td>
                <td className="!p-0">
                  <ManualCell
                    id={r.id}
                    field="details"
                    initial={r.details}
                    savedAt={r.detailsSavedAt ?? null}
                    serverNow={serverNow}
                    onSaved={onSaved}
                    readOnly={readOnly}
                  />
                </td>
                <td className="text-[11px] text-muted-foreground">{formatDateTime(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


/** Two independent manual cards, side by side (same design + autosave/lock). */
function ManualSection({
  isAdmin,
  cards,
  viewUserId,
}: {
  isAdmin: boolean;
  cards: [{ card: ManualKind; title: string }, { card: ManualKind; title: string }];
  /** أدمن يشاهد بيانات موظف محدد (قراءة فقط). */
  viewUserId?: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(getMyManualTxns);
  const empListFn = useServerFn(getEmployeeManualTxns);
  const addFn = useServerFn(addMyManualTxn);
  const clearFn = useServerFn(clearMyManualTxns);
  const [adding, setAdding] = useState<ManualKind | null>(null);
  const [clearing, setClearing] = useState<ManualKind | null>(null);
  const [newestId, setNewestId] = useState<string | null>(null);
  const readOnly = !!viewUserId;
  const listKey = viewUserId ? ["emp-manual-txns", viewUserId] : ["my-manual-txns"];

  const q = useQuery({
    queryKey: listKey,
    queryFn: () =>
      viewUserId ? empListFn({ data: { userId: viewUserId } }) : listFn({ data: undefined as any }),
    // Always re-read the stored rows when the section is opened again.
    staleTime: 0,
    refetchOnMount: "always",
  });
  const all = (q.data as any)?.rows ?? [];
  const serverNow = (q.data as any)?.serverNow ?? null;
  const refresh = () => void qc.invalidateQueries({ queryKey: listKey });

  const add = async (card: ManualKind) => {
    setAdding(card);
    try {
      const res: any = await addFn({ data: { card } });
      if (res?.ok) {
        setNewestId(String(res?.id ?? res?.row?.id ?? "") || null);
        await qc.invalidateQueries({ queryKey: ["my-manual-txns"] });
      } else toast.error(String(res?.error ?? "تعذر الإضافة"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الإضافة");
    } finally {
      setAdding(null);
    }
  };

  const clear = async (card: ManualKind) => {
    if (!confirm("سيتم حذف جميع المعاملات في هذا الكرت. متابعة؟")) return;
    setClearing(card);
    try {
      const res: any = await clearFn({ data: { card } });
      if (res?.ok) {
        toast.success("تم التصفير");
        await qc.invalidateQueries({ queryKey: ["my-manual-txns"] });
      } else toast.error(String(res?.error ?? "تعذر التصفير"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر التصفير");
    } finally {
      setClearing(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {cards.map((c) => (
        <ManualCard
          key={c.card}
          card={c.card}
          title={c.title}
          rows={all.filter((r: any) => r.card === c.card)}
          serverNow={serverNow}
          onAdd={add}
          onClear={clear}
          onSaved={refresh}
          adding={adding === c.card}
          clearing={clearing === c.card}
          newestId={newestId}
          isAdmin={isAdmin}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

/**
 * نفس الواجهة تُستخدم في الحالتين:
 *  - الموظف: بدون `viewUserId` → بياناته الخاصة (قابلة للتعديل كما هي).
 *  - الأدمن بعد اختيار موظف: `viewUserId` → بيانات ذلك الموظف فقط (قراءة).
 */
export function EmployeeWorkView({
  isAdmin = false,
  viewUserId,
  viewName,
  viewAvatar,
}: {
  isAdmin?: boolean;
  viewUserId?: string;
  viewName?: string;
  viewAvatar?: string;
}) {
  const qc = useQueryClient();
  const stateFn = useServerFn(getMyWorkState);
  const txnsFn = useServerFn(getMyShiftTxns);
  const empStateFn = useServerFn(getEmployeeWorkState);
  const empTxnsFn = useServerFn(getEmployeeShiftTxns);
  const brandsFn = useServerFn(getBybitCardBrands);
  const p2pFn = useServerFn(getWorkP2PCompleted);
  const viewing = !!viewUserId;

  const [tab, setTab] = useState<TabKey>("all");
  // إيداع / سحب داخل قسمي التحويلات (فلترة عرض فقط)
  const [flow, setFlow] = useState<"in" | "out">("in");
  const now = useNow();
  const clock = clockParts(now);

  const [name, setName] = useState(viewName || "موظف");
  const [avatar, setAvatar] = useState(viewAvatar || "");
  const identityFn = useServerFn(getViewerIdentity);
  useEffect(() => {
    if (viewing) {
      setName(viewName || "موظف");
      setAvatar(viewAvatar || "");
      return;
    }
    void (async () => {
      try {
        const v: any = await identityFn();
        setName(v?.full_name || v?.email?.split("@")[0] || "موظف");
        setAvatar(v?.avatar_url || "");
        return;
      } catch {
        // fall back to the client session below
      }
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle();
      setName((data?.full_name as string) || auth.user.email?.split("@")[0] || "موظف");
    })();
  }, [identityFn, viewing, viewName, viewAvatar]);

  const st = useQuery({
    queryKey: viewing ? ["emp-work-state", viewUserId] : ["my-work-state"],
    queryFn: () =>
      viewing ? empStateFn({ data: { userId: viewUserId! } }) : stateFn({ data: undefined as any }),
    refetchInterval: 20_000,
  });
  const holding = (st.data as any)?.holding === true;

  const txns = useQuery({
    queryKey: viewing ? ["emp-shift-txns", viewUserId] : ["my-shift-txns"],
    queryFn: () =>
      viewing
        ? empTxnsFn({ data: { userId: viewUserId!, page: 1 } })
        : txnsFn({ data: { page: 1 } }),
    enabled: holding,
    refetchInterval: 20_000,
  });

  // Completed P2P orders of all accounts — shared with every employee.
  const p2pCompleted = useQuery({
    queryKey: ["work-p2p-completed"],
    queryFn: () => p2pFn({ data: undefined as any }),
    refetchInterval: 30_000,
  });

  // Read-only filters over the same central ledger: external / internal.
  const transfersFn = useServerFn(getWorkTransfers);
  const extQ = useQuery({
    queryKey: ["work-transfers", "external"],
    queryFn: () => transfersFn({ data: { scope: "external" as const } }),
    enabled: tab === "ext",
    refetchInterval: 30_000,
  });
  const intQ = useQuery({
    queryKey: ["work-transfers", "internal"],
    queryFn: () => transfersFn({ data: { scope: "internal" as const } }),
    enabled: tab === "int",
    refetchInterval: 30_000,
  });




  const brandsQ = useQuery({
    queryKey: ["bybit-card-brands"],
    queryFn: () => brandsFn({ data: undefined as any }),
    staleTime: 300_000,
  });
  const brands = (brandsQ.data?.brands ?? {}) as Record<string, string>;

  const faceClaim = useFaceClaim(() => {
    qc.invalidateQueries({ queryKey: ["my-work-state"] });
    qc.invalidateQueries({ queryKey: ["my-shift-txns"] });
  });


  const allRows: any[] = (txns.data as any)?.rows ?? [];
  const txnServerNow: string | null = (txns.data as any)?.serverNow ?? null;
  const rows = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400_000;
    switch (tab) {
      case "wrong":
        return allRows.filter((r) => /fail|reject|decline|cancel/i.test(String(r.status)));
      case "transfers":
        return allRows.filter((r) => /transfer|deposit|withdraw/i.test(String(r.kind)));
      case "p2p":
        return allRows.filter((r) => /p2p/i.test(String(r.kind)));
      case "week":
        return allRows.filter((r) => Number(r.time) >= weekAgo);
      case "employee":
        return [] as any[];
      default:
        // «المعاملات» = card (visa) transactions only.
        return allRows.filter((r) => isCardTxn(r.kind));
    }
  }, [allRows, tab]);

  const [detailRow, setDetailRow] = useState<any | null>(null);
  const refetchRows = () =>
    void qc.invalidateQueries({
      queryKey: viewing ? ["emp-shift-txns", viewUserId] : ["my-shift-txns"],
    });

  const emptyRows = Math.max(12 - rows.length, 0);

  return (
    <div dir="rtl" className="space-y-4">
      {/* --------------------- identity / claim / clock --------------------- */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary/80 text-muted-foreground">
            {avatar ? (
              <img src={avatar} alt={name} className="size-full object-cover" />
            ) : (
              <User className="size-8" />
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-black">{name}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>موظف</span>
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span className="text-emerald-500">متصل</span>
            </div>
          </div>
        </div>

        {!viewing && (
          <>
            <button
              type="button"
              onClick={faceClaim.start}
              className="flex w-[96px] shrink-0 flex-col items-center gap-1 rounded-2xl border border-[oklch(0.55_0.14_250)] bg-card/70 px-2 py-2 text-[10px] font-bold transition hover:bg-card disabled:opacity-60"
            >
              <ScanFace className="size-5" />
              <span>استلم الشغل</span>
            </button>
            {faceClaim.node}
          </>
        )}


        <div className="flex shrink-0 items-center gap-3">
          <div className="text-left leading-tight">
            <div className="text-sm font-black tabular-nums">
              {clock.ampm} {clock.time}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{clock.date}</div>
          </div>
          <Clock className="size-6 text-muted-foreground" />
        </div>
      </div>

      {/* ---------------------------- Top bar ---------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        {TOP_TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-[11px] font-bold transition ${
                active ? GLOW_ACTIVE : GLOW_IDLE
              }`}
            >
              {t.key === "wrong" ? (
                <SplitTabContent />
              ) : (
                <>
                  <span className="whitespace-nowrap">{t.label}</span>
                  <Icon className="size-3.5 shrink-0" />
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* ----------- إيداع / سحب (نفس شكل القسم المركزي) ----------- */}
      {(tab === "ext" || tab === "int") && (
        <div className="flex flex-wrap items-center gap-2">
          <FlowChip active={flow === "in"} onClick={() => setFlow("in")}>
            إيداع
          </FlowChip>
          <FlowChip active={flow === "out"} onClick={() => setFlow("out")}>
            سحب
          </FlowChip>
        </div>
      )}

      {/* ------------------------- Transactions ------------------------- */}
      {tab === "wrong" ? (
        <ManualSection
          isAdmin={isAdmin}
          cards={[
            { card: "employee", title: "خاص بالموظف" },
            { card: "wrong", title: "المعاملات الغلط" },
          ]}
        />
      ) : tab === "transfers" ? (
        <ManualSection
          isAdmin={isAdmin}
          cards={[
            { card: "receive", title: "الاستلام من" },
            { card: "transfer", title: "التحويل الي" },
          ]}
        />
      ) : tab === "ext" ? (
        <TransfersTable
          rows={((extQ.data ?? []) as any[]).filter((r) => String(r.direction) === flow)}
          loading={extQ.isLoading}
          onDetails={setDetailRow}
          noteColumn={flow === "out"}
          onSaved={() => void extQ.refetch()}
        />
      ) : tab === "int" ? (
        <TransfersTable
          rows={((intQ.data ?? []) as any[]).filter((r) => String(r.direction) === flow)}
          loading={intQ.isLoading}
          onDetails={setDetailRow}
        />
      ) : tab === "p2p" ? (
        <P2POrdersTable
          rows={(p2pCompleted.data ?? []) as any[]}
          loading={p2pCompleted.isLoading}
          onDetails={setDetailRow}
          onLinked={() => p2pCompleted.refetch()}

        />
      ) : (


      <div className="data-surface">
        <div className="overflow-x-auto">
          <table className="data-table text-center">
            <thead>
              <tr>
                {COLUMNS.map((c) => {
                  const Icon = c.icon;
                  return (
                    <th key={c.label}>
                      <span className="flex items-center justify-center gap-1.5">
                        <span>{c.label}</span>
                        <Icon className="size-3.5 shrink-0 opacity-70" />
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {holding && txns.isLoading ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-8">
                    <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.assignmentId ?? r.ledgerId}>
                    <td>{String(r.detail?.merchantName ?? r.title ?? "—")}</td>
                    <td className="tabular-nums">
                      {num(Math.abs(Number(r.amount)))} {r.currency}
                    </td>
                    <td className="tabular-nums">
                      <EntryCell row={r} field="egp" serverNow={txnServerNow} onSaved={refetchRows} />
                    </td>
                    <td className="tabular-nums">
                      <EntryCell row={r} field="quantity" serverNow={txnServerNow} onSaved={refetchRows} />
                    </td>
                    <td>{txnTime(Number(r.time))}</td>
                    <td className="tabular-nums">
                      <Last4Cell detail={(r.detail ?? {}) as Record<string, unknown>} brands={brands} />
                    </td>
                    <td>
                      <button type="button" onClick={() => setDetailRow(r)} className="table-btn mx-auto">
                        التفاصيل
                      </button>
                    </td>
                  </tr>
                ))
              )}
              {Array.from({ length: emptyRows }).map((_, i) => (
                <tr key={`empty-${i}`}>
                  {COLUMNS.map((c) => (
                    <td key={c.label}>&nbsp;</td>
                  ))}
                </tr>
              ))}

            </tbody>
          </table>
        </div>
      </div>
      )}

      <TxnDetailsDialog row={detailRow} onClose={() => setDetailRow(null)} />
    </div>
  );
}
