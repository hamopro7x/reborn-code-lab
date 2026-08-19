import { Fragment, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";
import { getBybitLedger, syncBybitLedger } from "@/lib/bybit.functions";
import { formatDateTime } from "@/lib/format";
import { TXN_SECTIONS, fmtFieldValue, hasField, txnFeeBreakdown } from "@/lib/bybit-txn-fields";

const GROUPS: { key: string; label: string }[] = [
  { key: "txns", label: "المعاملات" },
  { key: "onchain", label: "السحب والإيداع الخارجي" },
  { key: "internal", label: "السحب والإيداع الداخلي" },
  { key: "p2p", label: "طلبات P2P" },
];

const SUB_FILTERS: Record<string, { key: string; label: string }[]> = {
  txns: [
    { key: "all", label: "الكل" },
    { key: "success", label: "المشتريات الناجحة" },
    { key: "failed", label: "المشتريات الفاشلة" },
    { key: "refund", label: "المبلغ المسترد" },
  ],
  onchain: [
    { key: "withdraw", label: "سحب" },
    { key: "deposit", label: "إيداع" },
  ],
  internal: [
    { key: "internal_out", label: "سحب" },
    { key: "internal_in", label: "إيداع" },
  ],
  p2p: [
    { key: "p2p_buy", label: "شراء" },
    { key: "p2p_sell", label: "بيع" },
  ],
};


const KIND_LABEL: Record<string, string> = {
  card: "شراء",
  "1": "شراء",
  refund: "استرداد",
  deposit: "إيداع خارجي",
  withdraw: "سحب خارجي",
  internal_in: "إيداع داخلي",
  internal_out: "تحويل داخلي",
  p2p_buy: "شراء P2P",
  p2p_sell: "بيع P2P",
};


function Chip({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-xs font-bold transition-colors border ${
        active
          ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
          : "text-muted-foreground border-border/40 hover:text-foreground hover:border-blue-500/30"
      }`}
    >
      {children}
    </button>
  );
}

function MerchantLogo({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  const clean = String(name ?? "").trim().toLowerCase();
  const first = clean.split(/[\s*_\-.,·/]+/)[0] ?? "";
  const domain = /^[a-z0-9]{2,}$/.test(first) ? `${first}.com` : null;
  const letter = String(name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="size-7 shrink-0 rounded-full bg-muted grid place-items-center overflow-hidden text-[10px] font-black">
      {domain && !failed ? (
        <img
          src={`https://www.google.com/s2/favicons?sz=64&domain=${domain}`}
          alt={`شعار ${name}`}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        letter
      )}
    </span>
  );
}

function VisaBadge() {
  return (
    <span className="rounded-md bg-[#1434cb] px-2 py-1 text-[8px] font-black italic tracking-wider text-white">VISA</span>
  );
}

const OK_STATUS = new Set([
  "success",
  "successful",
  "completed",
  "complete",
  "finished",
  "done",
  "filled",
  "ok",
  "2",
  "3",
  "ناجحة",
  "اكتملت",
  "مكتملة",
  "تمت",
  "منجزة",
]);
const BAD_STATUS = new Set([
  "failed",
  "fail",
  "failure",
  "cancelled",
  "canceled",
  "rejected",
  "expired",
  "ملغاة",
  "فاشلة",
  "مرفوضة",
  "منتهية",
]);

function statusBadge(kind: string, status: string) {
  const s = String(status || "").trim().toLowerCase();
  if (kind === "refund" || s === "refund" || s === "مسترد") return { cls: "bg-muted text-muted-foreground", text: "مسترد" };
  if (OK_STATUS.has(s)) return { cls: "bg-emerald-500/15 text-emerald-400", text: "ناجحة" };
  if (BAD_STATUS.has(s)) return { cls: "bg-red-500/15 text-red-400", text: "فاشلة" };
  if (s === "pending" || s === "قيد التنفيذ" || s === "0" || s === "1")
    return { cls: "bg-amber-500/15 text-amber-400", text: "قيد التنفيذ" };
  return { cls: "bg-muted text-muted-foreground", text: status || "—" };
}



function amt(n: number) {
  return Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}

/** السجل المركزي: كل معاملة على أي حساب من حسابات الفيزا تُسجَّل هنا تلقائياً. */
export function BybitLedgerPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(getBybitLedger);
  const syncFn = useServerFn(syncBybitLedger);
  const [group, setGroup] = useState("txns");
  const [status, setStatus] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const q = useQuery({
    queryKey: ["bybit-ledger", group, status, page],
    queryFn: () => listFn({ data: { group, status, page, pageSize } }),
    placeholderData: (prev) => prev,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  });

  // Fully automatic: no manual control. The scheduler keeps the ledger fresh in
  // the background; while the panel is open we also nudge a sync every 30s and
  // re-read the list, so new transactions appear on their own. Overlapping runs
  // are dropped server-side by the single-flight lease.
  const running = useRef(false);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive || running.current || typeof document === "undefined" || document.hidden) return;
      running.current = true;
      try {
        await syncFn();
        if (alive) qc.invalidateQueries({ queryKey: ["bybit-ledger"] });
      } catch {
        /* the next tick retries; the list keeps showing stored rows */
      } finally {
        running.current = false;
      }
    };
    const first = setTimeout(tick, 1000);
    const timer = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = q.data?.rows ?? [];
  
  const total = Number(q.data?.total ?? 0);
  const pages = Math.max(Math.ceil(total / pageSize), 1);

  return (
    <div className="relative z-10 space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {GROUPS.map((g) => (
            <Chip
              key={g.key}
              active={group === g.key}
              onClick={() => {
                setGroup(g.key);
                setStatus((SUB_FILTERS[g.key]?.[0]?.key) ?? "all");
                setPage(1);
                setOpenId(null);
              }}
            >
              {g.label}
            </Chip>
          ))}
        </div>
      </div>


      <div className="rounded-3xl border border-border/60 bg-card/70 overflow-hidden">
        <div className="flex flex-wrap items-center justify-start gap-1 p-4">
          {(SUB_FILTERS[group] ?? []).map((s) => (
            <Chip
              key={s.key}
              active={status === s.key}
              onClick={() => {
                setStatus(s.key);
                setPage(1);
                setOpenId(null);
              }}
            >
              {s.label}
            </Chip>
          ))}
        </div>


        {q.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
        ) : !rows.length ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            جارٍ تحديث السجل تلقائياً — ستظهر المعاملات هنا بمجرد جلبها.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm border-collapse [&_th]:border [&_th]:border-border/40 [&_td]:border [&_td]:border-border/40">
              <thead className="text-[12px] text-muted-foreground border border-border/40">
                <tr>
                  <th className="p-4 text-right font-normal">اسم التاجر</th>
                  <th className="p-4 text-center font-normal">إجمالي المبلغ المصحح</th>
                  <th className="p-4 text-right font-normal">النوع</th>
                  <th className="p-4 text-right font-normal">الحالة</th>
                  <th className="p-4 text-right font-normal">تاريخ ووقت المعاملة</th>
                  <th className="p-4 text-right font-normal">آخر 4 أرقام للبطاقة</th>
                  <th className="p-4 text-right font-normal">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const badge = statusBadge(r.kind, r.status);
                  const pan4 = String((r.detail as Record<string, unknown>)?.["pan4"] ?? "").trim();
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center justify-start gap-3">
                            <MerchantLogo name={r.title} />
                            <div className="min-w-0">
                              <div className="truncate font-semibold">{r.title}</div>
                              <div className="truncate text-[11px] text-muted-foreground">{r.accountName}</div>
                            </div>
                          </div>
                        </td>
                        <td
                          className={`p-4 text-center font-bold tabular-nums ${
                            r.direction === "in" ? "text-emerald-400" : "text-destructive"
                          }`}
                          dir="ltr"
                        >
                          {r.direction === "in" ? "+" : "-"}
                          {r.currency} {amt(r.amount)}
                        </td>
                        <td className="p-4 text-xs text-muted-foreground">{KIND_LABEL[r.kind] ?? r.kind}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${badge.cls}`}>
                            {badge.text}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-muted-foreground tabular-nums">{formatDateTime(r.time)}</td>
                        <td className="p-4">
                          {pan4 ? (
                            <span className="inline-flex items-center gap-2">
                              <VisaBadge />
                              <span className="font-bold tabular-nums">{pan4}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => setOpenId((v) => (v === r.id ? null : r.id))}
                            className="inline-flex items-center gap-1 text-sm text-amber-400 hover:underline"
                          >
                            التفاصيل
                            <ChevronDown className={`size-3.5 transition-transform ${openId === r.id ? "rotate-180" : ""}`} />
                          </button>
                        </td>
                      </tr>
                      {openId === r.id && (
                        <tr className="border-b border-border/40 bg-muted/20">
                          <td colSpan={7} className="p-4">
                            <LedgerRowDetails row={r} badgeText={badge.text} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 border-t border-border/40 p-4 text-xs">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="rounded-lg border border-border/60 px-3 py-1 disabled:opacity-40"
            >
              السابق
            </button>
            <span className="text-muted-foreground">
              صفحة {page} / {pages} — {total.toLocaleString("en-US")} سجل
            </span>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(p + 1, pages))}
              className="rounded-lg border border-border/60 px-3 py-1 disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Known keys already rendered by the labelled sections or the summary block. */
const RENDERED_KEYS = new Set([
  ...TXN_SECTIONS.flatMap((s) => s.defs.map(([k]) => k)),
  "pan4",
  "type",
  "raw",
  "tradeStatus",
  "side",
  "basicAmount",
  "basicCurrency",
  "settleAmount",
  "settleCurrency",
]);

/**
 * Read-only rendering of the ORIGINAL transaction data as it was mirrored from
 * the source account: same ids, amounts, merchant, dates, status and stage.
 * Status and stage are two separate fields and are never swapped.
 */
function LedgerRowDetails({ row, badgeText }: { row: any; badgeText: string }) {
  const d = (row.detail ?? {}) as Record<string, unknown>;
  const { total, fee, spend } = txnFeeBreakdown({ amount: row.amount, detail: d });
  const cur = String(row.currency || "USD");
  const money = (n: number) =>
    `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const sections = TXN_SECTIONS.map((s) => ({
    title: s.title,
    fields: s.defs.filter(([k]) => hasField(d, k)),
  })).filter((s) => s.fields.length);

  const extras = Object.entries(d).filter(
    ([k, v]) => !RENDERED_KEYS.has(k) && v !== null && v !== undefined && v !== "",
  );

  const summary: [string, string][] = [
    ["الحساب / الفيزا", row.accountName || "—"],
    ["نوع المعاملة", KIND_LABEL[row.kind] ?? row.kind],
    ["حالة المعاملة", badgeText],
    ["حالة المزوّد", String(row.status || "—")],
    ["مرحلة المعاملة", String(d["stage"] ?? "—")],
    ["تاريخ ووقت المعاملة", formatDateTime(row.time)],
    ["العملة", cur],
    ["آخر 4 أرقام للبطاقة", String(d["pan4"] ?? "—") || "—"],
    ["معرّف المعاملة", row.refId],
  ];

  return (
    <div className="rounded-2xl border border-border/50 bg-muted/10 p-4" dir="rtl">
      <div className="flex flex-col gap-5">
        <div>
          <div className="mb-3 text-sm font-black">ملخص المعاملة</div>
          <FieldGrid rows={summary} />
        </div>
        {sections.map((s) => (
          <div key={s.title}>
            <div className="mb-3 text-sm font-black">{s.title}</div>
            <FieldGrid rows={s.fields.map(([k, label]) => [label, fmtFieldValue(k, d[k])])} />
          </div>
        ))}
        <div>
          <div className="mb-3 text-sm font-black">الرسوم والمبلغ المحتسب</div>
          <FieldGrid
            rows={[
              ["إجمالي المعاملة", total !== null ? money(total) : "—"],
              ["الرسوم", fee !== null && fee > 0 ? money(fee) : fee === 0 ? "بدون رسوم" : row.fee ? money(Math.abs(row.fee)) : "بدون رسوم"],
              ["المحتسب في الصرف الشهري", spend !== null ? money(spend) : "—"],
            ]}
          />
        </div>
        {extras.length > 0 && (
          <div>
            <div className="mb-3 text-sm font-black">بيانات أصلية إضافية</div>
            <FieldGrid rows={extras.map(([k, v]) => [k, fmtFieldValue(k, v)])} />
          </div>
        )}
      </div>
    </div>
  );
}

function FieldGrid({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-3 border-b border-border/30 pb-2">
          <div className="shrink-0 text-[11px] text-muted-foreground">{label}</div>
          <div className="break-all text-left text-sm font-semibold" dir="auto">
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
