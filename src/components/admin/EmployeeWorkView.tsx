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
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, User, KeyRound, Clock, ListOrdered, AlertTriangle, ArrowLeftRight, ArrowDownUp, Users, Settings, CreditCard, CalendarClock, Package, DollarSign, Wallet, Plus } from "lucide-react";
import { toast } from "sonner";
import { MerchantLogo } from "./MerchantLogo";

import { formatTime } from "@/lib/format";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { getMyShiftTxns, getMyManualCardTxns, getShiftManualCardTxns, getEmployeeManualCardTxns, getWorkP2PCompleted, getWorkTransferPage, getEmployeeShiftTxns, getEmployeeShiftP2P, getShiftTxns, getShiftManualTxns, getShiftP2P, getMyShiftP2P, getMyAvatarUrl, getWorkSheetSummary } from "@/lib/work.functions";
import { getBybitCardBrands } from "@/lib/bybit.functions";
import { usePinClaim } from "@/components/admin/PinGate";
import { useWorkRealtime } from "@/lib/use-work-realtime";
import { useLedgerAutoSync } from "@/lib/use-ledger-sync";
import { livePoll } from "@/lib/live-poll";
import { useUiState } from "@/lib/ui-state";
import { Button } from "@/components/ui/button";
import { shiftEgpTotal } from "@/lib/shift-egp-total";
import { shiftSectionNotifications, type ShiftSection } from "@/lib/shift-section-notifications";

import { P2POrdersTable } from "@/components/admin/P2POrdersTable";
import { FlowChip, TransfersTable } from "@/components/admin/EmployeeTransfersTable";
import { num, txnTime } from "@/components/admin/EmployeeWorkFormatters";

import { Last4Cell, EntryCell, TxnDetailsDialog, isCardTxn } from "@/components/admin/EmployeeTransactionCells";
import { ManualSection } from "@/components/admin/EmployeeManualCards";
import { ManualTxnDialog, ManualTxnCell, MANUAL_TXN_WINDOW_MS } from "@/components/admin/EmployeeManualTransactions";

/** DOM order = right-to-left order in the reference. */
const TOP_TABS: { key: ShiftSection; label: string; icon: typeof ListOrdered }[] = [
  { key: "all", label: "المعاملات", icon: ListOrdered },
  { key: "employee", label: "الخاص بالموظف", icon: User },
  { key: "wrong", label: "المعاملات الغلط", icon: AlertTriangle },
  { key: "receive", label: "الاستلام من", icon: ArrowDownUp },
  { key: "transfer", label: "التحويل الي", icon: ArrowLeftRight },
  { key: "p2p", label: "طلبات p2p", icon: Users },
  { key: "ext", label: "الإيداع والسحب الخارجي", icon: ArrowDownUp },
  { key: "int", label: "الإيداع والسحب الداخلي", icon: ArrowLeftRight },
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
const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** توقيت موحّد (القاهرة) بأرقام لاتينية حتى تتطابق شاشة الموظف مع الأدمن. */
const SHIFT_TZ = "Africa/Cairo";
const shiftPartsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHIFT_TZ,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});
const EN_DAY_TO_AR: Record<string, string> = {
  Sun: "الأحد", Mon: "الإثنين", Tue: "الثلاثاء", Wed: "الأربعاء",
  Thu: "الخميس", Fri: "الجمعة", Sat: "السبت",
};

function fmtShiftDate(ts: number) {
  const parts = shiftPartsFmt.formatToParts(new Date(ts));
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  const ampm = get("dayPeriod").toLowerCase().includes("a") ? "ص" : "م";
  return {
    day: EN_DAY_TO_AR[get("weekday")] ?? get("weekday"),
    date: `${get("day")}/${get("month")}/${get("year")}`,
    time: `${get("hour")}:${get("minute")} ${ampm}`,
  };
}


/* ------- الإيداع والسحب الخارجي / الداخلي (read-only ledger filter) -------
 * Same central transactions used by «معاملات الفيزا»: nothing is created here,
 * the rows are the ORIGINAL ledger rows filtered by their real kind. */




/**
 * Card last 4 digits, taken from the ORIGINAL transaction payload stored with
 * the ledger row (pan4 as reported by the card account itself).
 */
export function EmployeeWorkView({
  isAdmin = false,
  viewUserId,  viewShiftId,
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
  viewShift?: { id: string; startedAt: number; endedAt: number | null; open: boolean; txns: number; reviewed?: boolean; label?: string };
  viewName?: string;
  viewAvatar?: string;
}) {
  const qc = useQueryClient();
  const txnsFn = useServerFn(getMyShiftTxns);
  const empTxnsFn = useServerFn(getEmployeeShiftTxns);
  const shiftTxnsFn = useServerFn(getShiftTxns);
  const shiftP2PFn = useServerFn(getShiftP2P);
  const brandsFn = useServerFn(getBybitCardBrands);
  const myP2PFn = useServerFn(getMyShiftP2P);
  const empP2PFn = useServerFn(getEmployeeShiftP2P);
  const shiftMode = !!viewShiftId;
  const viewing = !!viewUserId || shiftMode || blank;

  const [savedTab, setTab] = useUiState<string>("work-sheet", "tab", "all");
  const tab = TOP_TABS.find((item) => item.key === savedTab)?.key ?? "all";
  const reviewPending = isAdmin && shiftMode && viewShift?.reviewed === false;
  const [txnPage, setTxnPage] = useState(1);
  useEffect(() => setTxnPage(1), [viewShiftId, viewUserId]);
  const sheetPoll = shiftMode && viewShift?.endedAt ? false : livePoll(15_000);
  // إيداع / سحب داخل قسمي التحويلات (فلترة عرض فقط)
  const [flow, setFlow] = useUiState<"in" | "out">("work-sheet", "flow", "in");
  const [transferPage, setTransferPage] = useState(1);
  useEffect(() => setTransferPage(1), [flow, tab, viewShiftId]);

  // تحديث لحظي: أي تغيير حقيقي في المركز الرئيسي يحدّث الـqueries المتأثرة فقط.
  useWorkRealtime({ enabled: !blank, shiftId: viewShiftId ?? null, viewUserId: viewUserId ?? null });
  // اسحب المعاملات الجديدة من Bybit للشفت المفتوح بدون انتظار مزامنة يدوية.
  useLedgerAutoSync(!blank && !shiftMode);

  const txns = useQuery({
    queryKey: shiftMode
      ? ["shift-txns", viewShiftId, txnPage]
      : viewUserId
        ? ["emp-shift-txns", viewUserId, txnPage]
        : ["my-shift-txns", txnPage],
    // One server page per request; older rows remain reachable through pagination.
    queryFn: () =>
        shiftMode
          ? shiftTxnsFn({ data: { shiftId: String(viewShiftId), page: txnPage } })
          : viewUserId
            ? empTxnsFn({ data: { userId: viewUserId, page: txnPage } })
            : txnsFn({ data: { page: txnPage } }),
    // Start rows immediately beside the state request. Both row endpoints
    // resolve the relevant shift themselves, so waiting for `st` created an
    // avoidable request waterfall for admins and employees.
    enabled: !blank,
    refetchInterval: sheetPoll,
    refetchIntervalInBackground: false,
  });
  // The rows response includes the shift state, avoiding a second authenticated
  // request before the table can render.
  const workState = txns.data as any;
  const holding = blank ? false : shiftMode || workState?.holding === true;
  const txnTotal = Number(workState?.total ?? 0);
  useEffect(() => {
    if (!txns.isSuccess) return;
    const lastPage = Math.max(1, Math.ceil(txnTotal / 50));
    if (txnPage > lastPage) setTxnPage(lastPage);
  }, [txnTotal, txnPage, txns.isSuccess]);
  const summaryFn = useServerFn(getWorkSheetSummary);
  const sheetSummary = useQuery({
    queryKey: ["work-sheet-summary", viewShiftId ?? viewUserId ?? "me"],
    queryFn: () => summaryFn({ data: {
      ...(viewShiftId ? { shiftId: viewShiftId } : viewUserId ? { userId: viewUserId } : {}),
    } }),
    enabled: !blank && (tab === "all" || reviewPending),
    refetchInterval: sheetPoll,
    refetchIntervalInBackground: false,
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
        ? shiftP2PFn({ data: { shiftId: String(viewShiftId) } })
        : viewUserId
          ? empP2PFn({ data: { userId: viewUserId } })
          : myP2PFn({ data: undefined as any }),
    // الأدمن: لا تُحمّل بيانات P2P إلا بعد اختيار شفت محدد.
    enabled: !blank && (!viewUserId || shiftMode) && (tab === "all" || tab === "p2p"),
    refetchInterval: sheetPoll,
    refetchIntervalInBackground: false,
  });

  // طلبات P2P الجديدة (غير مرتبطة بأي شفت) — تظهر لكل الموظفين حتى يربطوها.
  const openP2PFn = useServerFn(getWorkP2PCompleted);
  const p2pOpen = useQuery({
    queryKey: ["work-p2p-open"],
    queryFn: () => openP2PFn({ data: undefined as any }),
    enabled: !blank && !viewUserId && !shiftMode && tab === "p2p",
    refetchInterval: sheetPoll,
    refetchIntervalInBackground: false,
  });

  const p2pRowsView = useMemo(() => {
    const linked = (p2pCompleted.data ?? []) as any[];
    const open = (p2pOpen.data ?? []) as any[];
    const ids = new Set(linked.map((r) => String(r.ledgerId)));
    return [...open.filter((r) => !ids.has(String(r.ledgerId))), ...linked];
  }, [p2pCompleted.data, p2pOpen.data]);


  // Read-only filters over the same central ledger: external / internal.
  const transfersFn = useServerFn(getWorkTransferPage);
  const extQ = useQuery({
    queryKey: shiftMode ? ["shift-transfers", viewShiftId, "external", flow, transferPage] : ["work-transfers", "external", flow, transferPage],
    queryFn: () => transfersFn({ data: { scope: "external", direction: flow, page: transferPage, ...(viewShiftId ? { shiftId: viewShiftId } : {}) } }),
    enabled: tab === "ext" && !blank,
    refetchInterval: sheetPoll,
    refetchIntervalInBackground: false,
  });
  const intQ = useQuery({
    queryKey: shiftMode ? ["shift-transfers", viewShiftId, "internal", flow, transferPage] : ["work-transfers", "internal", flow, transferPage],
    queryFn: () => transfersFn({ data: { scope: "internal", direction: flow, page: transferPage, ...(viewShiftId ? { shiftId: viewShiftId } : {}) } }),
    enabled: tab === "int" && !blank,
    refetchInterval: sheetPoll,
    refetchIntervalInBackground: false,
  });




  const brandsQ = useQuery({
    queryKey: ["bybit-card-brands"],
    queryFn: () => brandsFn({ data: undefined as any }),
    staleTime: 300_000,
  });
  const brands = (brandsQ.data?.brands ?? {}) as Record<string, string>;
  useEffect(() => {
    const query = tab === "ext" ? extQ : tab === "int" ? intQ : null;
    if (!query?.isSuccess) return;
    const last = Math.max(1, Math.ceil(Number(query.data?.total ?? 0) / 50));
    if (transferPage > last) setTransferPage(last);
  }, [tab, extQ.isSuccess, intQ.isSuccess, extQ.data?.total, intQ.data?.total, transferPage]);

  const allRows: any[] = blank ? [] : ((txns.data as any)?.rows ?? []);
  const txnServerNow: string | null = (txns.data as any)?.serverNow ?? null;
  const rows = useMemo(() => {
    switch (tab) {
      case "wrong":
        return allRows.filter((r) => /fail|reject|decline|cancel/i.test(String(r.status)));
      case "receive":
      case "transfer":
        return allRows.filter((r) => /transfer|deposit|withdraw/i.test(String(r.kind)));
      case "p2p":
        return allRows.filter((r) => /p2p/i.test(String(r.kind)));
      case "employee":
        return [] as any[];
      default:
        // «المعاملات» = card (visa) transactions only.
        return allRows.filter((r) => isCardTxn(r.kind));
    }
  }, [allRows, tab]);

  const [detailRow, setDetailRow] = useState<any | null>(null);
  const refetchRows = () =>
    void Promise.all([qc.invalidateQueries({ queryKey: ["work-sheet-summary"] }), qc.invalidateQueries({
      queryKey: shiftMode
        ? ["shift-txns", viewShiftId]
        : viewUserId
          ? ["emp-shift-txns", viewUserId]
          : ["my-shift-txns"],
    })]);

  /* ---- معاملات يدوية: عند الموظف (تعديل) وعند الأدمن (قراءة فقط) ---- */
  const manualCardFn = useServerFn(getMyManualCardTxns);
  const manualShiftFn = useServerFn(getShiftManualCardTxns);
  const manualEmpFn = useServerFn(getEmployeeManualCardTxns);
  const manualCardQ = useQuery({
    queryKey: shiftMode
      ? ["shift-manual-card-txns", viewShiftId]
      : viewUserId
        ? ["emp-manual-card-txns", viewUserId]        : ["my-manual-card-txns"],
    queryFn: () =>
      shiftMode
        ? manualShiftFn({ data: { shiftId: String(viewShiftId) } })
        : viewUserId
          ? manualEmpFn({ data: { userId: viewUserId } })
          : manualCardFn({ data: undefined as any }),    enabled: !blank && (tab === "all" || reviewPending),
    refetchInterval: sheetPoll,
    refetchIntervalInBackground: false,
  });
  const manualRows: any[] = blank || tab !== "all" ? [] : ((manualCardQ.data as any)?.rows ?? []);

  const shiftManualNotesFn = useServerFn(getShiftManualTxns);
  const shiftManualNotes = useQuery({
    queryKey: ["shift-manual-txns", viewShiftId],
    queryFn: () => viewShiftId
      ? shiftManualNotesFn({ data: { shiftId: viewShiftId } })
      : Promise.resolve({ rows: [] }),
    enabled: reviewPending && !blank,
    staleTime: 3_000,
    refetchInterval: sheetPoll,
    refetchIntervalInBackground: false,
  });
  const notifications = shiftSectionNotifications({
    isAdmin, shiftId: viewShiftId, reviewed: viewShift?.reviewed,
    transactionEntryCount: sheetSummary.data?.entered,
    transactions: allRows,
    manualCards: (manualCardQ.data as any)?.rows ?? [],
    manual: (shiftManualNotes.data as any)?.rows ?? [],
    external: extQ.data?.rows ?? [],
    externalNoteCount: sheetSummary.data?.externalNotes,
  });

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
    const count = sheetSummary.data ? sheetSummary.data.count + manualRows.length : mergedRows.length;
    const amount = sheetSummary.data
      ? sheetSummary.data.amount + manualRows.reduce((s, r: any) => s + Math.abs(n(r.amount)), 0)
      : mergedRows.reduce((s, r: any) => s + Math.abs(n(r.amount)), 0);
    const egp = sheetSummary.data ? sheetSummary.data.egp + shiftEgpTotal(manualRows) : shiftEgpTotal(mergedRows);
    const p2pRows = (viewUserId && !shiftMode ? [] : ((p2pCompleted.data ?? []) as any[])) as any[];
    const p2pEgp = p2pRows.reduce((s, r: any) => s + Math.abs(n((r.detail ?? {}).fiatAmount)), 0);
    const p2pUsdt = p2pRows.reduce((s, r: any) => s + Math.abs(n(r.amount)), 0);
    return { count, amount, egp, p2pEgp, p2pUsdt };
  }, [mergedRows, manualRows, sheetSummary.data, p2pCompleted.data, viewUserId, shiftMode]);


  /* --------------------- identity / claim / clock --------------------- */
  const pinClaim = usePinClaim(() => {
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
    time: formatTime(now, { second: "2-digit" }),
    date: `${AR_DAYS[now.getDay()]} ${now.toLocaleDateString("en-GB")}`,
  };


  return (
    <div dir="rtl" className="space-y-4">
      {!viewing && (
        <div className="flex flex-wrap items-center gap-2 mb-4">

          <div className="flex min-w-0 items-center gap-2">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-[oklch(0.55_0.14_255/0.55)] bg-[oklch(0.11_0.02_270)]">
              {avatar ? (
                <img src={avatar} alt={name} className="size-full object-cover" />
              ) : (
                <User className="size-7 text-foreground/70" />
              )}
            </div>
            <div className="min-w-0">
                <div className="truncate text-xl font-black">{name}</div>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-foreground/70">
                  {workState?.holding === true ? (
                    <>
                      <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                      <span className="font-bold text-emerald-500">متصل</span>
                    </>
                  ) : workState?.holding === false ? (
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
            onClick={pinClaim.start}
            className="flex w-[96px] shrink-0 flex-col items-center gap-1 rounded-2xl border border-[oklch(0.55_0.14_250)] bg-card/70 px-2 py-2 text-[11px] font-bold text-foreground/90 transition hover:bg-card disabled:opacity-60"
          >
            <KeyRound className="size-5 text-foreground/85" />
            <span>استلم الشغل</span>
          </button>
          {pinClaim.node}

          <div className="flex shrink-0 items-center gap-2">
            <div className="text-left leading-tight">
              <div className="text-base font-black tabular-nums">
                {clock.time}
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
                    <Row k="الساعه" v={start.time} />                  </div>
                </div>

                {/* رقم الشفت — في الأعلى بجانب الاتنين */}
                <div className="flex flex-col items-center gap-1">
                  <span className="rounded-md border border-[oklch(0.6_0.14_258/0.7)] bg-[oklch(0.45_0.19_263)] px-3 py-0.5 text-[11px] font-black text-white">
                    {viewShift.label ?? "الشفت"}
                  </span>                </div>

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
          {TOP_TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <Button
                variant="ghost"
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`relative flex h-auto items-center gap-2 rounded-2xl border px-3 py-2 text-[11px] font-bold transition ${
                  active ? GLOW_ACTIVE : GLOW_IDLE
                }`}
              >
                {notifications[t.key] > 0 && (
                  <span aria-label={`${notifications[t.key]} تسجيلات من الموظف لم تتم مراجعتها`} className="absolute -top-2 -right-1 grid min-w-5 h-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                    {notifications[t.key] > 99 ? "99+" : notifications[t.key]}
                  </span>
                )}
                <span className="whitespace-nowrap">{t.label}</span>
                <Icon className="size-4 shrink-0 text-[oklch(0.88_0.06_255)] drop-shadow-[0_0_4px_oklch(0.6_0.15_258/0.6)]" />
              </Button>
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
          key={tab}
          cards={
            tab === "employee"
              ? [{ card: "employee", title: "خاص بالموظف" }]
              : [{ card: "wrong", title: "المعاملات الغلط" }]
          }
        />
      ) : tab === "receive" || tab === "transfer" ? (
        <ManualSection
          isAdmin={isAdmin}
          {...(viewUserId ? { viewUserId } : {})}
          {...(viewShiftId ? { viewShiftId } : {})}
          blank={blank}
          key={tab}
          cards={
            tab === "receive"
              ? [{ card: "receive", title: "الاستلام من" }]
              : [{ card: "transfer", title: "التحويل الي" }]
          }
        />
      ) : tab === "ext" ? (
        <TransfersTable
          rows={extQ.data?.rows ?? []}
          loading={extQ.isLoading}
          onDetails={setDetailRow}
          noteColumn={flow === "out"}
          onSaved={() => void extQ.refetch()}
          readOnly={viewing}
        />
      ) : tab === "int" ? (
        <TransfersTable
          rows={intQ.data?.rows ?? []}
          loading={intQ.isLoading}
          onDetails={setDetailRow}
          readOnly={viewing}
        />
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
          <div className="flex flex-wrap items-center justify-start gap-3 px-3 pb-2 pt-2">
            <button
              type="button"
              onClick={openManual}
              title="إضافة معاملة يدوية"
              className="flex items-center gap-1 rounded-2xl border border-[oklch(0.55_0.14_255)] bg-[oklch(0.11_0.02_270)] px-3 py-1 text-[11px] font-bold text-white/90 transition hover:bg-[oklch(0.2_0.06_258)] active:scale-95"
            >
              <Plus className="size-3" />
              <span>إضافة</span>
            </button>
            <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 py-1 text-[13px] font-extrabold text-foreground" role="status" aria-label="إجمالي الجنيه" dir="rtl">
              <span>مصري :</span>
              <span className="break-all tabular-nums" dir="ltr">
                {summary.egp.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </span>
            </div>
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
              {viewing && !shiftMode && workState?.holding === false ? (                <tr>
                  <td colSpan={COLUMNS.length} className="py-8 text-center text-xs text-muted-foreground">
                    {workState?.live === true
                      ? "الشفت الحالي شغّال ولا يوجد شفت منتهي بعد."
                      : "لا توجد شفتات لهذا الموظف."}
                  </td>
                </tr>
              ) : txns.isError && !txns.data ? (
                <tr><td colSpan={COLUMNS.length} className="py-6">                  <span className="text-destructive">تعذّر تحميل المعاملات. </span>
                  <Button variant="outline" onClick={() => void txns.refetch()}>أعد المحاولة</Button>
                </td></tr>
              ) : txns.isLoading ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-8">
                    <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                  </td>
                </tr>
              ) : (
                mergedRows.map((r) =>
                  r.__manual ? (
                    (() => {
                      const locked = viewing || manualLocked(r);
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
        <PaginationBar page={txnPage} pageSize={50} total={txnTotal} onPage={setTxnPage} />
      </div>
      )}

      {(tab === "ext" || tab === "int") && <>
        {(tab === "ext" ? extQ.isError : intQ.isError) && <div role="alert" className="text-destructive">تعذّر تحميل التحويلات. <Button variant="outline" onClick={() => void (tab === "ext" ? extQ : intQ).refetch()}>أعد المحاولة</Button></div>}
        <PaginationBar page={transferPage} pageSize={50} total={Number((tab === "ext" ? extQ.data : intQ.data)?.total ?? 0)} onPage={setTransferPage} />
      </>}

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