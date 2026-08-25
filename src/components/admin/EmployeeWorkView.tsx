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
  ScanFace,
  Clock,
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
  Plus,
  ClipboardList,

  

} from "lucide-react";
import { toast } from "sonner";
import { MerchantLogo } from "./MerchantLogo";
import { formatDateTime } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/pagination";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyWorkState,
  getMyShiftTxns,
  saveMyTxnEntry,
  saveTransferNote,
  getMyManualTxns,
  addMyManualTxn,
  saveMyManualTxn,
  getMyManualCardTxns,
  addMyManualCardTxn,
  saveMyManualCardTxn,
  clearMyManualTxns,
  getWorkP2PCompleted,
  getWorkTransfers,

  getMyShiftsForLink,
  linkP2POrder,
  getEmployeeWorkState,
  getEmployeeShiftTxns,
  getEmployeeManualTxns,
  getEmployeeShiftP2P,
  getShiftTxns,
  getShiftManualTxns,
  getShiftTransfers,
  getShiftP2P,
  getMyShiftP2P,
  getEmployeeArchive,
  deleteEmployeeManualTxn,

  getMyAvatarUrl,
} from "@/lib/work.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getBybitCardBrands } from "@/lib/bybit.functions";
import { useFaceClaim } from "@/components/admin/FaceGate";
import { BrandBadge, LedgerRowDetails, statusBadge } from "@/components/admin/BybitLedgerPanel";

type ManualKind = "wrong" | "employee" | "receive" | "transfer";

type TabKey = "p2p" | "transfers" | "wrong" | "week" | "all" | "employee" | "ext" | "int" | "summary";

/** DOM order = right-to-left order in the reference. */
const TOP_TABS: { key: TabKey; label: string; icon: typeof ListOrdered }[] = [
  { key: "all", label: "المعاملات", icon: ListOrdered },
  { key: "employee", label: "الخاص بالموظف", icon: User },
  { key: "wrong", label: "المعاملات الغلط", icon: AlertTriangle },
  { key: "transfers", label: "الاستلام من والتحويل الي", icon: ArrowLeftRight },
  { key: "p2p", label: "طلبات p2p", icon: Users },
  { key: "ext", label: "الإيداع والسحب الخارجي", icon: ArrowDownUp },
  { key: "int", label: "الإيداع والسحب الداخلي", icon: ArrowLeftRight },
  { key: "summary", label: "ملخص الشفت", icon: ClipboardList },
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
  "border-border/60 bg-[oklch(0.14_0.02_270)] text-foreground/90 hover:border-[oklch(0.45_0.1_258)] hover:text-foreground";



/* ------------------------- P2P orders table (طلبات P2P) -------------------------
 * Same look as the approved reference: blue pill header row, buy/sell toggle,
 * dark rows with green side + gold owner link. Presentation only. */
const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function fmtShiftDate(ts: number) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  const h24 = d.getHours();
  const h = ((h24 + 11) % 12) || 12;
  return {
    day: AR_DAYS[d.getDay()],
    date: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`,
    time: `${p(h)}:${p(d.getMinutes())} ${h24 < 12 ? "ص" : "م"}`,
  };
}


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
  readOnly,
}: {
  rows: any[];
  loading?: boolean;
  onDetails: (row: any) => void;
  onLinked?: () => void;
  /** أدمن يشاهد سجل شفت — بدون ربط. */
  readOnly?: boolean;
}) {
  const emptyRows = Math.max(8 - rows.length, 0);
  const columns = readOnly
    ? P2P_COLUMNS.filter((c) => c !== "صاحب الطلب")
    : P2P_COLUMNS;

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
                    {!readOnly && (
                      <td>
                        {r.assignmentId ? (
                          <span className="text-[11px] font-bold text-emerald-400">مرتبط</span>
                        ) : (
                          <P2PLinkMenu ledgerId={String(r.ledgerId)} onLinked={onLinked} />
                        )}
                      </td>
                    )}

                  </tr>
                );
              })
            )}
            {Array.from({ length: emptyRows }).map((_, i) => (
              <tr key={`p2p-empty-${i}`}>
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
        className="h-8 w-20 border-0 bg-transparent px-2 text-center text-xs tabular-nums outline-none focus:bg-white/5"
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
        className={`flex h-full w-full min-w-0 items-start gap-1 px-3 py-2.5 text-xs text-foreground/90 ${
          numeric ? "justify-center tabular-nums" : "justify-end text-right"
        }`}
      >
        <span className="w-full break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{value}</span>
      </div>
    );
  }

  if (!numeric) {
    // «التفاصيل»: نص متعدد الأسطر — العرض ثابت والارتفاع هو الذي يزيد.
    return (
      <textarea
        data-no-autosave
        autoFocus={autoFocus}
        rows={1}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          const el = e.target as HTMLTextAreaElement;
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
        }}
        ref={(el) => {
          if (el) {
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }
        }}
        onBlur={(e) => flush(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className="block min-h-[2.6rem] w-full min-w-0 max-w-full resize-none overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] border-0 bg-transparent px-3 py-2.5 text-right text-xs text-foreground/90 outline-none placeholder:text-transparent"
      />
    );
  }

  return (
    <input
      data-no-autosave
      autoFocus={autoFocus}
      inputMode="decimal"
      value={value}
      onChange={(e) => setValue(clean(e.target.value))}
      onBlur={(e) => flush(clean(e.target.value))}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-full w-full min-w-0 border-0 bg-transparent px-3 py-2.5 text-center text-xs tabular-nums text-foreground/90 outline-none placeholder:text-transparent"
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
  onDelete,
  header,
}: {
  card: ManualKind;
  title: string;
  rows: {
    id: string;
    amount: string;
    details: string;
    shiftId?: string | null;
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
  onDelete?: (id: string) => void;
  /** Custom header replaces the default blue title bar. */
  header?: React.ReactNode;
}) {
  const totalAmount = useMemo(() => {
    return rows.reduce((sum, r) => {
      const latin = String(r.amount ?? "")
        .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
        .replace(/[\u066b\u060c,]/g, ".")
        .replace(/[^\d.]/g, "");
      const [head, ...rest] = latin.split(".");
      const normalized = rest.length ? `${head}.${rest.join("")}` : head ?? "";
      const n = parseFloat(normalized);
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);
  }, [rows]);

  const totalCount = rows.length;

  return (
    <div className="data-surface">
      {header ? (
        header
      ) : (
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
      )}

      <div className="max-h-[520px] min-h-[520px] overflow-y-auto overflow-x-hidden scrollbar-hide">
        <table className="data-table manual-table text-center">
          <thead className="sticky top-0 z-10">
            {isAdmin && (
              <tr className="summary-row admin-summary">
                <th className="w-[24%]">
                  <span className="summary-text">
                    <span className="text-white/90">الإجمالي</span>
                    <span className="value">: {totalAmount.toLocaleString("en-US")}</span>
                  </span>
                </th>
                <th>
                  <span className="summary-text">
                    <span className="text-white/90">إجمالي المعاملات</span>
                    <span className="value">: {totalCount.toLocaleString("en-US")}</span>
                  </span>
                </th>
                <th className="w-[34%]">&nbsp;</th>
              </tr>
            )}
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
                    savedAt={r.createdAt ?? null}
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
                    savedAt={r.createdAt ?? null}
                    serverNow={serverNow}
                    onSaved={onSaved}
                    readOnly={readOnly}
                  />
                </td>

                <td className="text-[11px] text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <span>{formatDateTime(r.createdAt)}</span>
                    {onDelete && !r.shiftId && (
                      <button
                        type="button"
                        onClick={() => onDelete(r.id)}
                        title="حذف الصف (بدون شفت)"
                        className="grid size-6 shrink-0 place-items-center rounded-lg border border-destructive/50 text-destructive transition hover:bg-destructive/15 active:scale-95"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                </td>
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
  viewShiftId,
  blank = false,
}: {
  isAdmin: boolean;
  cards: { card: ManualKind; title: string }[];
  /** أدمن يشاهد بيانات موظف محدد (قراءة فقط). */
  viewUserId?: string;
  /** أدمن يشاهد شفتًا محددًا — سجل ذلك الشفت فقط (قراءة فقط). */
  viewShiftId?: string;
  /** جدول فارغ تمامًا (الأدمن لم يختر شفتًا بعد). */
  blank?: boolean;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(getMyManualTxns);
  const empListFn = useServerFn(getEmployeeManualTxns);
  const shiftListFn = useServerFn(getShiftManualTxns);
  const addFn = useServerFn(addMyManualTxn);
  const clearFn = useServerFn(clearMyManualTxns);
  const [adding, setAdding] = useState<ManualKind | null>(null);
  const [clearing, setClearing] = useState<ManualKind | null>(null);
  const [newestId, setNewestId] = useState<string | null>(null);
  const readOnly = !!viewUserId || !!viewShiftId || blank;
  const listKey = viewShiftId
    ? ["shift-manual-txns", viewShiftId]
    : viewUserId
      ? ["emp-manual-txns", viewUserId]
      : ["my-manual-txns"];

  const q = useQuery({
    queryKey: listKey,
    queryFn: () =>
      viewShiftId
        ? shiftListFn({ data: { shiftId: viewShiftId } })
        : viewUserId
          ? empListFn({ data: { userId: viewUserId } })
          : listFn({ data: undefined as any }),
    enabled: !blank,
    // Always re-read the stored rows when the section is opened again.
    staleTime: 0,
    refetchOnMount: "always",
  });
  const all = blank ? [] : ((q.data as any)?.rows ?? []);
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

/* ==================== «ملخص الشفت» — أدمن فقط ====================
 * أرشيف كامل لكل شفتات الموظف المحدد: نفس الأقسام السبعة بنفس تصميمها
 * وأعمدتها، لكن البيانات مدمجة من جميع الشفتات ومرتّبة من الأقدم إلى الأحدث.
 * قراءة فقط، وبلا أي تعديل على سلوك الأقسام الأصلية. */
type ArchiveTabKey = "employee" | "wrong";



function ArchiveTxnsTable({
  rows,
  brands,
  onDetails,
}: {
  rows: any[];
  brands: Record<string, string>;
  onDetails: (row: any) => void;
}) {
  return (
    <div className="data-surface">
      <div className="overflow-x-auto">
        <table className="data-table text-center">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.label}>
                  <span>{c.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-8 text-center text-xs text-muted-foreground">
                  لا توجد معاملات
                </td>
              </tr>
            ) : (
              rows.map((r) =>
                r.__manual ? (
                  <tr key={`m-${r.id}`}>
                    <td className="text-right">
                      <span className="flex items-center justify-start gap-2">
                        <MerchantLogo name={String(r.merchant ?? "—")} />
                        <span>{String(r.merchant ?? "—")}</span>
                      </span>
                    </td>
                    <td className="tabular-nums">{r.amount || "—"}</td>
                    <td className="tabular-nums">{r.egp || "—"}</td>
                    <td className="tabular-nums">{r.quantity || "—"}</td>
                    <td>{txnTime(Number(r.time))}</td>
                    <td className="tabular-nums">{r.pan4 || "—"}</td>
                    <td>&nbsp;</td>
                  </tr>
                ) : (
                  <tr key={r.assignmentId ?? r.ledgerId}>
                    <td className="text-right">
                      <span className="flex items-center justify-start gap-2">
                        <MerchantLogo name={String(r.detail?.merchantName ?? r.title ?? "—")} />
                        <span>{String(r.detail?.merchantName ?? r.title ?? "—")}</span>
                      </span>
                    </td>
                    <td className="tabular-nums">
                      {num(Math.abs(Number(r.amount)))} {r.currency}
                    </td>
                    <td className="tabular-nums">{r.egp ?? "—"}</td>
                    <td className="tabular-nums">{r.quantity ?? "—"}</td>
                    <td>{txnTime(Number(r.time))}</td>
                    <td className="tabular-nums">
                      <Last4Cell detail={(r.detail ?? {}) as Record<string, unknown>} brands={brands} />
                    </td>
                    <td>
                      <button type="button" onClick={() => onDetails(r)} className="table-btn mx-auto">
                        التفاصيل
                      </button>
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArchiveCard({
  userId,
  card,
  title,
}: {
  userId: string;
  card: ArchiveTabKey;
  title: string;
}) {
  const [page, setPage] = useState(1);
  const archiveFn = useServerFn(getEmployeeArchive);
  const deleteFn = useServerFn(deleteEmployeeManualTxn);

  useEffect(() => {
    setPage(1);
  }, [userId, card]);

  const q = useQuery({
    queryKey: ["emp-archive", userId, card, page],
    queryFn: () => archiveFn({ data: { userId, card, page, pageSize: PAGE_SIZE } }),
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return (
      <div className="data-surface grid min-h-[420px] place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const d = (q.data ?? {}) as any;
  const manualRows: any[] = d.manual?.rows ?? [];
  const manualNow: string | null = d.manual?.serverNow ?? null;

  const del = async (id: string) => {
    if (!window.confirm("حذف هذا الصف نهائيًا؟")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("تم حذف الصف");
      q.refetch();
    } catch {
      toast.error("تعذّر حذف الصف");
    }
  };

  return (
    <div className="space-y-2">
      <ManualCard
        card={card}
        title={title}
        rows={manualRows.filter((r) => r.card === card)}
        serverNow={manualNow}
        onAdd={() => {}}
        onClear={() => {}}
        onSaved={() => {}}
        adding={false}
        clearing={false}
        newestId={null}
        isAdmin
        readOnly
        onDelete={del}
      />
      <PaginationBar
        page={Number(d.manual?.page ?? page)}
        total={Number(d.manual?.total ?? manualRows.length)}
        pageSize={Number(d.manual?.pageSize ?? PAGE_SIZE)}
        onPage={setPage}
        className="data-surface rounded-2xl"
      />
    </div>
  );
}

function ShiftArchive({ userId }: { userId: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <ArchiveCard userId={userId} card="employee" title="خاص بالموظف" />
      <ArchiveCard userId={userId} card="wrong" title="المعاملات الغلط" />
    </div>
  );
}



/* ============ «معاملة يدوية» داخل قسم المعاملات — الموظف فقط ============
 * سجل مستقل عن معاملات الـAPI. الشفت يُستنتج على السيرفر، والتاريخ/الوقت
 * من ساعة السيرفر، والتعديل 10 دقائق من وقت الإنشاء (يُفرض على السيرفر أيضًا)،
 * ولا يوجد حذف إطلاقًا. */

const MANUAL_TXN_WINDOW_MS = 10 * 60 * 1000;

/** نموذج إضافة معاملة يدوية — بدون اختيار شفت وبدون تاريخ/وقت. */
function ManualTxnDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const addFn = useServerFn(addMyManualCardTxn);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [egp, setEgp] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pan4, setPan4] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMerchant("");
      setAmount("");
      setEgp("");
      setQuantity("");
      setPan4("");
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      const res: any = await addFn({ data: { merchant, amount, egp, quantity, pan4 } });

      if (!res?.ok) {
        toast.error(res?.error ?? "تعذّر إضافة المعاملة");
        return;
      }
      toast.success("تم إضافة المعاملة");
      onAdded();
      onClose();
    } catch {
      toast.error("تعذّر إضافة المعاملة");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-xl border border-border/50 bg-[oklch(0.13_0.02_270)] px-3 py-2 text-xs font-bold outline-none focus:border-[oklch(0.55_0.14_255)]";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-black">إضافة معاملة يدوية</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-[11px] font-bold text-muted-foreground">اسم التاجر</div>
            <input className={field} value={merchant} onChange={(e) => setMerchant(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-[11px] font-bold text-muted-foreground">إجمالي الذي قمت بدفعه</div>
              <input className={field} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <div className="mb-1 text-[11px] font-bold text-muted-foreground">المبلغ الذي استلمته من العميل</div>
              <input className={field} value={egp} onChange={(e) => setEgp(e.target.value)} inputMode="decimal" />
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-bold text-muted-foreground">الكمية</div>
            <input
              className={field}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-bold text-muted-foreground">
              آخر 4 أرقام للبطاقة - أو طريقة الدفع التي دفعت من خلالها
            </div>
            {/* خانة حرة: أرقام/حروف/رموز/مسافات */}
            <input className={field} type="text" value={pan4} onChange={(e) => setPan4(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="table-btn">
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="table-btn disabled:opacity-60"
            >
              {busy ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : "حفظ"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** خانة قابلة للتعديل خلال 10 دقائق من الإنشاء فقط. */
function ManualTxnCell({
  row,
  field,
  locked,
  onSaved,
}: {
  row: any;
  field: "merchant" | "amount" | "egp" | "quantity" | "pan4";
  locked: boolean;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveMyManualCardTxn);
  const current = String(row[field] ?? "");
  const [value, setValue] = useState<string>(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(current), [row.id, current]);

  if (locked) return <span>{current || "—"}</span>;

  const commit = async () => {
    if (value === current) return;
    setBusy(true);
    try {
      const res: any = await saveFn({ data: { id: row.id, field, value } });
      if (!res?.ok) {
        toast.error(res?.error ?? "تعذّر الحفظ");
        setValue(current);
      } else onSaved();
    } catch {
      toast.error("تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <input
      type="text"
      value={value}
      disabled={busy}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      className="w-full min-w-[70px] border-0 bg-transparent px-2 py-1 text-center text-[11px] font-bold outline-none focus:bg-white/5"
    />
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
  viewShiftId,
  viewShift,
  viewName,
  viewAvatar,
  blank = false,
}: {
  isAdmin?: boolean;
  /** جدول فارغ تمامًا — الأدمن اختار موظفًا لكن لم يختر شفتًا. */
  blank?: boolean;
  viewUserId?: string;
  /** أدمن اختار شفتًا محددًا → سجل ذلك الشفت فقط (قراءة). */
  viewShiftId?: string;
  /** بيانات الشفت المختار (للعرض فقط بجانب هوية الموظف). */
  viewShift?: { id: string; startedAt: number; endedAt: number | null; open: boolean; txns: number; label?: string };
  viewName?: string;
  viewAvatar?: string;
}) {
  const qc = useQueryClient();
  const stateFn = useServerFn(getMyWorkState);
  const txnsFn = useServerFn(getMyShiftTxns);
  const empStateFn = useServerFn(getEmployeeWorkState);
  const empTxnsFn = useServerFn(getEmployeeShiftTxns);
  const shiftTxnsFn = useServerFn(getShiftTxns);
  const shiftTransfersFn = useServerFn(getShiftTransfers);
  const shiftP2PFn = useServerFn(getShiftP2P);
  const brandsFn = useServerFn(getBybitCardBrands);
  const myP2PFn = useServerFn(getMyShiftP2P);
  const empP2PFn = useServerFn(getEmployeeShiftP2P);
  const shiftMode = !!viewShiftId;
  const viewing = !!viewUserId || shiftMode || blank;

  const [tab, setTab] = useState<TabKey>("all");
  // إيداع / سحب داخل قسمي التحويلات (فلترة عرض فقط)
  const [flow, setFlow] = useState<"in" | "out">("in");

  // تحديث لحظي: أي تغيير حقيقي في المركز الرئيسي يحدّث الـqueries المتأثرة فقط.
  useWorkRealtime({ enabled: !blank, shiftId: viewShiftId ?? null, viewUserId: viewUserId ?? null });

  const st = useQuery({
    queryKey: viewing ? ["emp-work-state", viewUserId] : ["my-work-state"],
    queryFn: () =>
      viewUserId ? empStateFn({ data: { userId: viewUserId } }) : stateFn({ data: undefined as any }),
    enabled: !shiftMode && !blank,
    refetchInterval: 20_000,
  });
  // في وضع الشفت المحدد: السجل التاريخي متاح دائمًا.
  const holding = blank ? false : shiftMode || (st.data as any)?.holding === true;

  const txns = useQuery({
    queryKey: shiftMode
      ? ["shift-txns", viewShiftId]
      : viewUserId
        ? ["emp-shift-txns", viewUserId]
        : ["my-shift-txns"],
    queryFn: () =>
      shiftMode
        ? shiftTxnsFn({ data: { shiftId: viewShiftId!, page: 1 } })
        : viewUserId
          ? empTxnsFn({ data: { userId: viewUserId, page: 1 } })
          : txnsFn({ data: { page: 1 } }),
    enabled: holding && !blank,
    refetchInterval: 20_000,
  });

  // طلبات P2P: الموظف والأدمن يشاهدون فقط الطلبات المرتبطة بالشفت المختار/المفتوح.
  const p2pCompleted = useQuery({
    queryKey: shiftMode
      ? ["shift-p2p", viewShiftId]
      : viewUserId
        ? ["emp-shift-p2p", viewUserId]
        : ["my-shift-p2p"],
    queryFn: () =>
      shiftMode
        ? shiftP2PFn({ data: { shiftId: viewShiftId! } })
        : viewUserId
          ? empP2PFn({ data: { userId: viewUserId } })
          : myP2PFn({ data: undefined as any }),
    // الأدمن: لا تُحمّل بيانات P2P إلا بعد اختيار شفت محدد.
    enabled: !blank && (!viewUserId || shiftMode),
    refetchInterval: 30_000,
  });

  // طلبات P2P الجديدة (غير مرتبطة بأي شفت) — تظهر لكل الموظفين حتى يربطوها.
  const openP2PFn = useServerFn(getWorkP2PCompleted);
  const p2pOpen = useQuery({
    queryKey: ["work-p2p-open"],
    queryFn: () => openP2PFn({ data: undefined as any }),
    enabled: !blank && !viewUserId && !shiftMode,
    refetchInterval: 30_000,
  });

  const p2pRowsView = useMemo(() => {
    const linked = (p2pCompleted.data ?? []) as any[];
    const open = (p2pOpen.data ?? []) as any[];
    const ids = new Set(linked.map((r) => String(r.ledgerId)));
    return [...open.filter((r) => !ids.has(String(r.ledgerId))), ...linked];
  }, [p2pCompleted.data, p2pOpen.data]);


  // Read-only filters over the same central ledger: external / internal.
  const transfersFn = useServerFn(getWorkTransfers);
  const extQ = useQuery({
    queryKey: shiftMode ? ["shift-transfers", viewShiftId, "external"] : ["work-transfers", "external"],
    queryFn: () =>
      shiftMode
        ? shiftTransfersFn({ data: { shiftId: viewShiftId!, scope: "external" as const } })
        : transfersFn({ data: { scope: "external" as const } }),
    enabled: tab === "ext" && !blank,
    refetchInterval: 30_000,
  });
  const intQ = useQuery({
    queryKey: shiftMode ? ["shift-transfers", viewShiftId, "internal"] : ["work-transfers", "internal"],
    queryFn: () =>
      shiftMode
        ? shiftTransfersFn({ data: { shiftId: viewShiftId!, scope: "internal" as const } })
        : transfersFn({ data: { scope: "internal" as const } }),
    enabled: tab === "int" && !blank,
    refetchInterval: 30_000,
  });




  const brandsQ = useQuery({
    queryKey: ["bybit-card-brands"],
    queryFn: () => brandsFn({ data: undefined as any }),
    staleTime: 300_000,
  });
  const brands = (brandsQ.data?.brands ?? {}) as Record<string, string>;

  const allRows: any[] = blank ? [] : ((txns.data as any)?.rows ?? []);
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
      queryKey: shiftMode
        ? ["shift-txns", viewShiftId]
        : viewUserId
          ? ["emp-shift-txns", viewUserId]
          : ["my-shift-txns"],
    });

  /* ---- معاملات يدوية: قسم «المعاملات» عند الموظف فقط ---- */
  const manualCardFn = useServerFn(getMyManualCardTxns);
  const manualCardQ = useQuery({
    queryKey: ["my-manual-card-txns"],
    queryFn: () => manualCardFn({ data: undefined as any }),
    enabled: !viewing && tab === "all",
    refetchInterval: 30_000,
  });
  const manualRows: any[] = viewing || tab !== "all" ? [] : ((manualCardQ.data as any)?.rows ?? []);
  const [manualOpen, setManualOpen] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (viewing || !manualRows.length) return;
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, [viewing, manualRows.length]);
  void tick;
  const manualLocked = (r: any) =>
    Date.now() - new Date(r.createdAt).getTime() >= MANUAL_TXN_WINDOW_MS;
  const openManual = () => {
    if (!holding) {
      toast.error("يجب فتح شفت أولًا لإضافة معاملة يدوية.");
      return;
    }
    setManualOpen(true);
  };

  /** المعاملات مرتّبة زمنيًا (اليدوي + الـ API معًا). */
  const mergedRows = useMemo(() => {
    const manual = manualRows.map((r) => ({ ...r, __manual: true, time: new Date(r.createdAt).getTime() }));
    return [...manual, ...rows].sort((a: any, b: any) => Number(b.time) - Number(a.time));
  }, [manualRows, rows]);

  const emptyRows = Math.max(12 - mergedRows.length, 0);

  /** صف الملخص فوق عناوين الأعمدة — خاص بالموظف/الشفت المعروض فقط. */
  const summary = useMemo(() => {
    const n = (v: unknown) => {
      const x = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
      return Number.isFinite(x) ? x : 0;
    };
    const count = mergedRows.length;
    const amount = mergedRows.reduce((s, r: any) => s + Math.abs(n(r.amount)), 0);
    const egp = mergedRows.reduce((s, r: any) => s + Math.abs(n(r.egp)), 0);
    const p2pRows = (viewUserId && !shiftMode ? [] : ((p2pCompleted.data ?? []) as any[])) as any[];
    const p2pEgp = p2pRows.reduce((s, r: any) => s + Math.abs(n((r.detail ?? {}).fiatAmount)), 0);
    const p2pUsdt = p2pRows.reduce((s, r: any) => s + Math.abs(n(r.amount)), 0);
    return { count, amount, egp, p2pEgp, p2pUsdt };
  }, [mergedRows, p2pCompleted.data, viewUserId, shiftMode]);


  /* --------------------- identity / claim / clock --------------------- */
  const faceClaim = useFaceClaim(() => {
    void qc.invalidateQueries({ queryKey: ["my-work-state"] });
    void qc.invalidateQueries({ queryKey: ["my-shift-txns"] });
  });

  const myAvatarFn = useServerFn(getMyAvatarUrl);
  const meQ = useQuery({
    queryKey: ["my-profile-identity"],
    enabled: !viewing,
    queryFn: () => myAvatarFn() as Promise<{ name: string; avatar: string | null }>,
    staleTime: 300_000,
  });
  const name = viewing ? (viewName ?? "") : (meQ.data?.name ?? "");
  const avatar = viewing ? (viewAvatar ?? "") : (meQ.data?.avatar ?? "");

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const clock = {
    time: now.toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    ampm: now.getHours() < 12 ? "صباحاً" : "مساء",
    date: `${AR_DAYS[now.getDay()]} ${now.toLocaleDateString("en-GB")}`,
  };


  return (
    <div dir="rtl" className="space-y-4">
      {!viewing && (
        <div className="flex flex-wrap items-center gap-2 mb-4">

          <div className="flex min-w-0 items-center gap-2">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary/80 text-foreground/80">
              {avatar ? (
                <img src={avatar} alt={name} className="size-full object-cover" />
              ) : (
                <User className="size-8" />
              )}
            </div>
              <div className="min-w-0">
                <div className="truncate text-xl font-black">{name}</div>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-foreground/70">
                  {st.data?.holding === true ? (
                    <>
                      <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                      <span className="font-bold text-emerald-500">متصل</span>
                    </>
                  ) : st.data?.holding === false ? (
                    <>
                      <span className="size-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                      <span className="font-bold text-red-500">غير متصل</span>
                    </>
                  ) : (
                    <>
                      <span className="size-2 rounded-full bg-muted-foreground" />
                      <span className="text-muted-foreground">جارٍ التحميل...</span>
                    </>
                  )}
                </div>
              </div>
          </div>

          <button
            type="button"
            onClick={faceClaim.start}
            className="flex w-[96px] shrink-0 flex-col items-center gap-1 rounded-2xl border border-[oklch(0.55_0.14_250)] bg-card/70 px-2 py-2 text-[11px] font-bold text-foreground/90 transition hover:bg-card disabled:opacity-60"
          >
            <ScanFace className="size-5 text-foreground/85" />
            <span>استلم الشغل</span>
          </button>
          {faceClaim.node}

          <div className="flex shrink-0 items-center gap-2">
            <div className="text-left leading-tight">
              <div className="text-base font-black tabular-nums">
                {clock.ampm} {clock.time}
              </div>
              <div className="mt-1 text-xs font-bold tabular-nums text-foreground/70">{clock.date}</div>
            </div>
            <Clock className="size-6 text-foreground/80" />
          </div>
        </div>

      )}

      {/* ---------------------------- Top bar ---------------------------- */}

      {viewing && (
          <div className="flex h-[92px] max-h-[92px] min-h-[92px] flex-nowrap items-center gap-3 overflow-hidden mb-[17px]">

          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-[oklch(0.55_0.14_255/0.55)] bg-[oklch(0.11_0.02_270)] shadow-[0_0_20px_-6px_oklch(0.55_0.14_255/0.45)]">
            {avatar ? (
              <img src={avatar} alt={name} className="size-full object-cover" />
            ) : (
              <User className="size-7 text-white/70" />
            )}
          </div>


          {viewShift && (() => {
            const start = fmtShiftDate(viewShift.startedAt);
            const end = viewShift.endedAt ? fmtShiftDate(viewShift.endedAt) : null;
            const CHIP =
              "rounded-md bg-[oklch(0.45_0.19_263)] px-4 py-0.5 text-center text-[11px] font-black text-white shadow-[0_0_12px_-4px_oklch(0.55_0.2_263/0.8)]";
            const BOX =
              "rounded-md border border-[oklch(0.6_0.14_258/0.75)] bg-[oklch(0.16_0.02_270)] px-2 py-1 text-right shadow-[0_0_0_1px_oklch(0_0_0/0.6)]";
            const Row = ({ k, v }: { k: string; v: string }) => (
              <div className="flex items-center gap-1 text-[11px] font-bold leading-tight tabular-nums">
                <span className="text-white/65">{k} :</span>
                <span className="text-white">{v}</span>
              </div>
            );
            return (
              <div className="flex flex-row items-start gap-1" dir="rtl">
                {/* بدا — على اليمين */}
                <div className="flex flex-col items-center gap-1">
                  <span className={CHIP}>بدا</span>
                  <div className={BOX}>
                    <Row k="اليوم" v={start.day} />
                    <Row k="التاريخ" v={start.date} />
                    <Row k="الساعه" v={start.time} />
                  </div>
                </div>

                {/* رقم الشفت — في الأعلى بجانب الاتنين */}
                <div className="flex flex-col items-center gap-1">
                  <span className="rounded-md border border-[oklch(0.6_0.14_258/0.7)] bg-[oklch(0.45_0.19_263)] px-3 py-0.5 text-[11px] font-black text-white">
                    {viewShift.label ?? "الشفت"}
                  </span>
                </div>

                {/* انتهي — على اليسار */}
                <div className="flex flex-col items-center gap-1">
                  <span className={CHIP}>انتهي</span>
                  <div className={BOX}>
                    {end ? (
                      <>
                        <Row k="اليوم" v={end.day} />
                        <Row k="التاريخ" v={end.date} />
                        <Row k="الساعه" v={end.time} />
                      </>
                    ) : (
                      <div className="py-1 text-[11px] font-black text-emerald-400">شغّال الآن</div>
                    )}
                  </div>
                </div>
              </div>
            );

          })()}

        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-[0.1cm]">
          {TOP_TABS.filter((t) => t.key !== "summary" || isAdmin).map((t) => {
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
                <span className="whitespace-nowrap">{t.label}</span>
                <Icon className="size-4 shrink-0 text-[oklch(0.88_0.06_255)] drop-shadow-[0_0_4px_oklch(0.6_0.15_258/0.6)]" />
              </button>
            );
          })}
        </div>

        {/* ----------- إيداع / سحب (نفس شكل القسم المركزي) ----------- */}
        {(tab === "ext" || tab === "int") && (
          <div className="flex flex-wrap items-center gap-[0.1cm]">
            <FlowChip active={flow === "in"} onClick={() => setFlow("in")}>
              إيداع
            </FlowChip>
            <FlowChip active={flow === "out"} onClick={() => setFlow("out")}>
              سحب
            </FlowChip>
          </div>
        )}
      </section>

      {/* ------------------------- Transactions ------------------------- */}
      {tab === "employee" || tab === "wrong" ? (
        <ManualSection
          isAdmin={isAdmin}
          {...(viewUserId ? { viewUserId } : {})}
          {...(viewShiftId ? { viewShiftId } : {})}
          blank={blank}
          cards={[
            { card: "employee", title: "خاص بالموظف" },
            { card: "wrong", title: "المعاملات الغلط" },
          ]}
        />
      ) : tab === "transfers" ? (
        <ManualSection
          isAdmin={isAdmin}
          {...(viewUserId ? { viewUserId } : {})}
          {...(viewShiftId ? { viewShiftId } : {})}
          blank={blank}
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
          readOnly={viewing}
        />
      ) : tab === "int" ? (
        <TransfersTable
          rows={((intQ.data ?? []) as any[]).filter((r) => String(r.direction) === flow)}
          loading={intQ.isLoading}
          onDetails={setDetailRow}
          readOnly={viewing}
        />
      ) : tab === "summary" ? (
        viewUserId ? (
          <ShiftArchive userId={viewUserId} />
        ) : (
          <div className="data-surface grid min-h-[420px] place-items-center text-xs text-muted-foreground">
            اختر موظفًا لعرض ملخص جميع شفتاته.
          </div>
        )
      ) : tab === "p2p" ? (

        <P2POrdersTable
          rows={p2pRowsView}
          loading={p2pCompleted.isLoading || p2pOpen.isLoading}
          onDetails={setDetailRow}
          onLinked={() => {
            void p2pCompleted.refetch();
            void p2pOpen.refetch();
          }}
          readOnly={!!viewUserId || shiftMode}
        />

      ) : (


      <div className="data-surface">
        {!viewing && (
          <div className="flex items-center justify-start px-3 pb-1.5 pt-2">
            <button
              type="button"
              onClick={openManual}
              title="إضافة معاملة يدوية"
              className="flex items-center gap-1 rounded-2xl border border-[oklch(0.55_0.14_255)] bg-[oklch(0.11_0.02_270)] px-3 py-1 text-[11px] font-bold text-white/90 transition hover:bg-[oklch(0.2_0.06_258)] active:scale-95"
            >
              <Plus className="size-3" />
              <span>إضافة</span>
            </button>
          </div>
        )}
        <div className="overflow-x-auto">

          <table className="data-table text-center">
            <thead>
              {isAdmin && shiftMode && (
                <tr className="summary-row admin-summary">
                  {[
                    {
                      label: "عدد المعاملات",
                      value: summary.count === 0 ? "لايوجد" : summary.count.toLocaleString("en-US"),
                    },
                    {
                      label: "اجمالي مبلغ الدولار",
                      value: summary.amount === 0 ? "لايوجد" : summary.amount.toLocaleString("en-US"),
                    },
                    {
                      label: "مصري",
                      value: summary.egp === 0 ? "لايوجد" : summary.egp.toLocaleString("en-US"),
                    },
                    {
                      label: "طلبات P2P",
                      value:
                        summary.p2pEgp === 0 && summary.p2pUsdt === 0
                          ? "لايوجد"
                          : `EGP ${summary.p2pEgp.toLocaleString("en-US")} | $ ${summary.p2pUsdt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    },
                  ].map((s) => (
                    <th key={s.label}>
                      <span className="summary-text">
                        <span className="text-white/90">{s.label}</span>
                        <span className="value">: {s.value}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              )}
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.label}>
                    <span>{c.label}</span>
                  </th>
                ))}
              </tr>

            </thead>

            <tbody>
              {viewing && !shiftMode && (st.data as any)?.holding === false ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-8 text-center text-xs text-muted-foreground">
                    {(st.data as any)?.live === true
                      ? "الشفت الحالي شغّال ولا يوجد شفت منتهي بعد."
                      : "لا توجد شفتات لهذا الموظف."}
                  </td>
                </tr>
              ) : holding && txns.isLoading ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-8">
                    <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                  </td>
                </tr>
              ) : (
                mergedRows.map((r) =>
                  r.__manual ? (
                    (() => {
                      const locked = manualLocked(r);
                      const refresh = () => void manualCardQ.refetch();
                      const mName = String(r.merchant ?? "—");
                      return (
                        <tr key={`manual-${r.id}`}>
                          <td className="text-right">
                            <span className="flex items-center justify-start gap-2">
                              <MerchantLogo name={mName} />
                              <ManualTxnCell row={r} field="merchant" locked={locked} onSaved={refresh} />
                            </span>
                          </td>
                          <td className="tabular-nums">
                            <ManualTxnCell row={r} field="amount" locked={locked} onSaved={refresh} />
                          </td>
                          <td className="tabular-nums">
                            <ManualTxnCell row={r} field="egp" locked={locked} onSaved={refresh} />
                          </td>
                          <td className="tabular-nums">
                            <ManualTxnCell row={r} field="quantity" locked={locked} onSaved={refresh} />
                          </td>
                          <td>{txnTime(Number(r.time))}</td>
                          <td>
                            <ManualTxnCell row={r} field="pan4" locked={locked} onSaved={refresh} />
                          </td>
                          <td>&nbsp;</td>
                        </tr>
                      );
                    })()
                  ) : (
                  <tr key={r.assignmentId ?? r.ledgerId}>
                    <td className="text-right">
                      <span className="flex items-center justify-start gap-2">
                        <MerchantLogo name={String(r.detail?.merchantName ?? r.title ?? "—")} />
                        <span>{String(r.detail?.merchantName ?? r.title ?? "—")}</span>
                      </span>
                    </td>
                    <td className="tabular-nums">
                      {num(Math.abs(Number(r.amount)))} {r.currency}
                    </td>
                    <td className="tabular-nums">
                      <EntryCell row={r} field="egp" serverNow={txnServerNow} onSaved={refetchRows} readOnly={viewing} />
                    </td>
                    <td className="tabular-nums">
                      <EntryCell row={r} field="quantity" serverNow={txnServerNow} onSaved={refetchRows} readOnly={viewing} />
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
                  ),
                )
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
      {!viewing && (
        <ManualTxnDialog
          open={manualOpen}
          onClose={() => setManualOpen(false)}
          onAdded={() => void manualCardQ.refetch()}
        />
      )}
    </div>
  );
}
