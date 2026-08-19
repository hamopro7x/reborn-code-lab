/**
 * Employee execution view — visual design is fixed by the approved reference:
 * black surface, one header row (identity → claim button → live clock → tabs),
 * then a single bordered panel holding the transactions grid. Data is real:
 * it comes from the employee's own open shift only.
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
import { Loader2, User, Clock, ScanFace, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMyWorkState, getMyShiftTxns, saveMyTxnEntry } from "@/lib/work.functions";
import { useClaimWork } from "@/lib/use-claim-work";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getBybitCardBrands } from "@/lib/bybit.functions";
import { BrandBadge, LedgerRowDetails, statusBadge } from "@/components/admin/BybitLedgerPanel";

type TabKey = "p2p" | "transfers" | "wrong" | "week" | "all";

/** DOM order = right-to-left order in the reference. */
const TABS: { key: TabKey; label: string }[] = [
  { key: "p2p", label: "طلبات P2P" },
  { key: "transfers", label: "الاستلم من والتحويل الي" },
  { key: "wrong", label: "المعاملات الغلط" },
  { key: "week", label: "المعاملات علي مدار الاسبوع" },
  { key: "all", label: "المعاملات" },
];

const COLUMNS = [
  "اسم التاجر",
  "إجمالي المبلغ",
  "جنيه",
  "الكمية",
  "تاريخ وقت المعاملة",
  "آخر 4 أرقام للبطاقة",
  "الإجراء",
];

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

/** One employee-entered cell: write-once, auto-saved on blur, then locked. */
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

  if (saved !== null && saved !== undefined) {
    return (
      <span className="tabular-nums">
        {Number(saved).toLocaleString("en-US", { maximumFractionDigits: 4 })}
      </span>
    );
  }

  const commit = async () => {
    const n = Number(String(value).replace(/,/g, "").trim());
    if (!value.trim() || !Number.isFinite(n) || n < 0) return;
    setBusy(true);
    try {
      const res: any = await saveFn({ data: { ledgerId: row.ledgerId, field, value: n } });
      if (res?.ok) {
        toast.success("تم الحفظ");
        onSaved();
      } else {
        toast.error(String(res?.error ?? "تعذر الحفظ"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-center gap-1">
      <input
        inputMode="decimal"
        data-no-autosave
        disabled={busy}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
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

export function EmployeeWorkView() {
  const qc = useQueryClient();
  const stateFn = useServerFn(getMyWorkState);
  const txnsFn = useServerFn(getMyShiftTxns);
  const brandsFn = useServerFn(getBybitCardBrands);
  const [tab, setTab] = useState<TabKey>("all");
  const now = useNow();
  const clock = clockParts(now);

  const [name, setName] = useState("موظف");
  useEffect(() => {
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle();
      setName((data?.full_name as string) || auth.user.email?.split("@")[0] || "موظف");
    })();
  }, []);

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
      default:
        // «المعاملات» = card (visa) transactions only.
        return allRows.filter((r) => isCardTxn(r.kind));
    }
  }, [allRows, tab]);

  const [detailRow, setDetailRow] = useState<any | null>(null);
  const refetchRows = () => void qc.invalidateQueries({ queryKey: ["my-shift-txns"] });

  const emptyRows = Math.max(12 - rows.length, 0);

  return (
    <div dir="rtl" className="space-y-5">
      {/* ---------------------------- Header ---------------------------- */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 lg:flex lg:flex-wrap lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          {/* identity */}
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-16 shrink-0 place-items-center rounded-full bg-secondary/80 text-muted-foreground">
              <User className="size-8" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-black">{name}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>موظف</span>
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span className="text-emerald-500">{holding ? "متصل" : "متصل"}</span>
              </div>
            </div>
          </div>

          {/* claim work */}
          <button
            type="button"
            onClick={() => void claim()}
            disabled={busy !== null}
            className="flex w-[112px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-[oklch(0.62_0.18_250)] bg-card/70 px-3 py-3 text-[11px] font-bold transition hover:bg-card disabled:opacity-60"
          >
            {busy === "claim" ? (
              <Loader2 className="size-6 animate-spin text-foreground" />
            ) : (
              <ScanFace className="size-6" />
            )}
            <span>استلم الشغل</span>
          </button>

          {/* live clock */}
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

        {/* tabs */}
        <div className="col-span-2 flex flex-wrap items-center gap-3 lg:col-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full border px-5 py-2.5 text-xs font-bold transition ${
                tab === t.key
                  ? "border-[oklch(0.62_0.18_250)] bg-card/60 text-[oklch(0.72_0.16_250)]"
                  : "border-border/70 bg-card/50 text-foreground/85 hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------- Transactions ------------------------- */}
      <div className="rounded-3xl border border-border/70 bg-card/40 p-5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center text-xs">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c}
                    className="border border-border/50 bg-background/40 px-4 py-5 font-bold text-foreground/90 whitespace-nowrap"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holding && txns.isLoading ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="border border-border/40 px-4 py-10">
                    <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.assignmentId ?? r.ledgerId}>
                    <td className="border border-border/40 px-4 py-4 whitespace-nowrap">
                      {String(r.detail?.merchantName ?? r.title ?? "—")}
                    </td>
                    <td className="border border-border/40 px-4 py-4 tabular-nums whitespace-nowrap">
                      {num(Math.abs(Number(r.amount)))} {r.currency}
                    </td>
                    <td className="border border-border/40 px-4 py-4 tabular-nums whitespace-nowrap">
                      <EntryCell row={r} field="egp" onSaved={refetchRows} />
                    </td>
                    <td className="border border-border/40 px-4 py-4 tabular-nums whitespace-nowrap">
                      <EntryCell row={r} field="quantity" onSaved={refetchRows} />
                    </td>
                    <td className="border border-border/40 px-4 py-4 whitespace-nowrap">{txnTime(Number(r.time))}</td>
                    <td className="border border-border/40 px-4 py-4 tabular-nums whitespace-nowrap">
                      <Last4Cell detail={(r.detail ?? {}) as Record<string, unknown>} brands={brands} />
                    </td>
                    <td className="border border-border/40 px-4 py-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setDetailRow(r)}
                        className="mx-auto flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-[11px] font-bold transition hover:text-[oklch(0.72_0.16_250)]"
                      >
                        <Eye className="size-3.5" />
                        التفاصيل
                      </button>
                    </td>
                  </tr>
                ))
              )}
              {Array.from({ length: emptyRows }).map((_, i) => (
                <tr key={`empty-${i}`}>
                  {COLUMNS.map((c) => (
                    <td key={c} className="border border-border/40 px-4 py-4">
                      &nbsp;
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <TxnDetailsDialog row={detailRow} onClose={() => setDetailRow(null)} />
    </div>
  );
}
