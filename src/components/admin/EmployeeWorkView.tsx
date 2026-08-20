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
  Eye,
  ListOrdered,
  Layers,
  AlertTriangle,
  ArrowLeftRight,
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
import { supabase } from "@/integrations/supabase/client";
import {
  getMyWorkState,
  getMyShiftTxns,
  saveMyTxnEntry,
  getMyManualTxns,
  addMyManualTxn,
  saveMyManualTxn,
  clearMyManualTxns,
} from "@/lib/work.functions";
import { useClaimWork } from "@/lib/use-claim-work";
import { getViewerIdentity } from "@/lib/courses.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getBybitCardBrands } from "@/lib/bybit.functions";
import { BrandBadge, LedgerRowDetails, statusBadge } from "@/components/admin/BybitLedgerPanel";

type TabKey = "p2p" | "transfers" | "wrong" | "week" | "all" | "employee";

/** DOM order = right-to-left order in the reference. */
const TOP_TABS: { key: TabKey; label: string; icon: typeof ListOrdered }[] = [
  { key: "all", label: "المعاملات", icon: ListOrdered },
  { key: "week", label: "الحسابات المتراكمة", icon: Layers },
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




function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

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

/** One employee-entered cell: auto-saved while typing (debounce + blur +
 * tab-hide flush), then locked once the server stored the value. */
function EntryCell({
  row,
  field,
  onSaved,
}: {
  row: any;
  field: "egp" | "quantity";
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveMyTxnEntry);
  const saved = row[field];
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const valueRef = useRef("");
  const sentRef = useRef("");
  

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
          sentRef.current = "";
          toast.error(String(res?.error ?? "تعذر الحفظ"));
        }
      })
      .catch((e) => {
        sentRef.current = "";
        toast.error(e instanceof Error ? e.message : "تعذر الحفظ");
      })
      .finally(() => setBusy(false));
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Never lose a value the employee typed then walked away from.
  useEffect(() => {
    const onHide = () => commitRef.current(valueRef.current);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      commitRef.current(valueRef.current);
    };
  }, []);

  if (saved !== null && saved !== undefined) {
    return (
      <span className="tabular-nums">
        {Number(saved).toLocaleString("en-US", { maximumFractionDigits: 4 })}
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

/** One manual cell: autosaved while typing (debounced) and flushed on blur. */
function ManualCell({
  id,
  field,
  initial,
  numeric,
  autoFocus,
}: {
  id: string;
  field: "amount" | "details";
  initial: string;
  numeric?: boolean;
  autoFocus?: boolean;
}) {
  const saveFn = useServerFn(saveMyManualTxn);
  const [value, setValue] = useState(initial);
  const [locked, setLocked] = useState(initial.trim() !== "");
  const savedRef = useRef(initial);
  const valueRef = useRef(initial);

  const flush = (v: string) => {
    if (v === savedRef.current) {
      if (v.trim() !== "") setLocked(true);
      return;
    }
    savedRef.current = v;
    void saveFn({ data: { id, field, value: v } })
      .then((res: any) => {
        if (res && res.ok === false) {
          savedRef.current = "\u0000";
          toast.error(String(res.error ?? "تعذر الحفظ"));
          return;
        }
        if (v.trim() !== "") setLocked(true);
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
        title="محفوظ — لا يمكن التعديل"
        className={`h-full w-full px-3 py-2.5 text-xs text-foreground/90 ${
          numeric ? "text-center tabular-nums" : "text-right"
        }`}
      >
        {value}
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
  onAdd,
  onClear,
  adding,
  clearing,
  newestId,
  isAdmin,
}: {
  card: "wrong" | "employee";
  title: string;
  rows: { id: string; amount: string; details: string }[];
  onAdd: (card: "wrong" | "employee") => void;
  onClear: (card: "wrong" | "employee") => void;
  adding: boolean;
  clearing: boolean;
  newestId: string | null;
  isAdmin: boolean;
}) {
  return (
    <div className="data-surface">
      <div className="data-table-head relative flex items-center justify-center px-3 py-3">
        <span className="text-sm font-black">{title}</span>
        <div className="absolute left-3 flex items-center gap-2">
          {isAdmin && rows.length > 0 && (
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
        </div>
      </div>

      <div className="max-h-[520px] min-h-[520px] overflow-y-auto overflow-x-hidden scrollbar-hide">
        <table className="data-table text-center">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-[26%]">المبلغ</th>
              <th>التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="!p-0">
                  <ManualCell id={r.id} field="amount" initial={r.amount} numeric autoFocus={r.id === newestId} />
                </td>
                <td className="!p-0">
                  <ManualCell id={r.id} field="details" initial={r.details} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


/** The two independent cards, side by side. */
function ManualSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(getMyManualTxns);
  const addFn = useServerFn(addMyManualTxn);
  const clearFn = useServerFn(clearMyManualTxns);
  const [adding, setAdding] = useState<"wrong" | "employee" | null>(null);
  const [clearing, setClearing] = useState<"wrong" | "employee" | null>(null);
  const [newestId, setNewestId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["my-manual-txns"],
    queryFn: () => listFn({ data: undefined as any }),
  });
  const all = (q.data as any)?.rows ?? [];

  const add = async (card: "wrong" | "employee") => {
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

  const clear = async (card: "wrong" | "employee") => {
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
      <ManualCard
        card="employee"
        title="خاص بالموظف"
        rows={all.filter((r: any) => r.card === "employee")}
        onAdd={add}
        onClear={clear}
        adding={adding === "employee"}
        clearing={clearing === "employee"}
        newestId={newestId}
        isAdmin={isAdmin}
      />
      <ManualCard
        card="wrong"
        title="المعاملات الغلط"
        rows={all.filter((r: any) => r.card === "wrong")}
        onAdd={add}
        onClear={clear}
        adding={adding === "wrong"}
        clearing={clearing === "wrong"}
        newestId={newestId}
        isAdmin={isAdmin}
      />
    </div>
  );
}

export function EmployeeWorkView({ isAdmin = false }: { isAdmin?: boolean }) {
  const qc = useQueryClient();
  const stateFn = useServerFn(getMyWorkState);
  const txnsFn = useServerFn(getMyShiftTxns);
  const brandsFn = useServerFn(getBybitCardBrands);
  const [tab, setTab] = useState<TabKey>("all");
  const now = useNow();
  const clock = clockParts(now);

  const [name, setName] = useState("موظف");
  const [avatar, setAvatar] = useState("");
  const identityFn = useServerFn(getViewerIdentity);
  useEffect(() => {
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
  }, [identityFn]);

  const st = useQuery({
    queryKey: ["my-work-state"],
    queryFn: () => stateFn({ data: undefined as any }),
    refetchInterval: 20_000,
  });
  const holding = (st.data as any)?.holding === true;

  const txns = useQuery({
    queryKey: ["my-shift-txns"],
    queryFn: () => txnsFn({ data: { page: 1 } }),
    enabled: holding,
    refetchInterval: 20_000,
  });

  const brandsQ = useQuery({
    queryKey: ["bybit-card-brands"],
    queryFn: () => brandsFn({ data: undefined as any }),
    staleTime: 300_000,
  });
  const brands = (brandsQ.data?.brands ?? {}) as Record<string, string>;

  const { busy, claim } = useClaimWork(() => {
    qc.invalidateQueries({ queryKey: ["my-work-state"] });
    qc.invalidateQueries({ queryKey: ["my-shift-txns"] });
  });


  const allRows: any[] = (txns.data as any)?.rows ?? [];
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
  const refetchRows = () => void qc.invalidateQueries({ queryKey: ["my-shift-txns"] });

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

        <button
          type="button"
          onClick={() => void claim()}
          disabled={busy !== null}
          className="flex w-[96px] shrink-0 flex-col items-center gap-1 rounded-2xl border border-[oklch(0.55_0.14_250)] bg-card/70 px-2 py-2 text-[10px] font-bold transition hover:bg-card disabled:opacity-60"
        >
          {busy === "claim" ? (
            <Loader2 className="size-5 animate-spin text-foreground" />
          ) : (
            <ScanFace className="size-5" />
          )}
          <span>استلم الشغل</span>
        </button>


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



      {/* ------------------------- Transactions ------------------------- */}
      {tab === "wrong" ? <ManualSection isAdmin={isAdmin} /> : (
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
                      <EntryCell row={r} field="egp" onSaved={refetchRows} />
                    </td>
                    <td className="tabular-nums">
                      <EntryCell row={r} field="quantity" onSaved={refetchRows} />
                    </td>
                    <td>{txnTime(Number(r.time))}</td>
                    <td className="tabular-nums">
                      <Last4Cell detail={(r.detail ?? {}) as Record<string, unknown>} brands={brands} />
                    </td>
                    <td>
                      <button type="button" onClick={() => setDetailRow(r)} className="table-btn mx-auto">
                        <Eye className="size-3" />
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
