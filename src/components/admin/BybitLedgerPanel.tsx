import { Fragment, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { getBybitLedger, syncBybitLedger } from "@/lib/bybit.functions";
import { formatDateTime } from "@/lib/format";

const GROUPS: { key: string; label: string }[] = [
  { key: "txns", label: "المعاملات" },
  { key: "onchain", label: "السحب والإيداع الخارجي" },
  { key: "internal", label: "السحب والإيداع الداخلي" },
  { key: "p2p", label: "طلبات P2P" },
];

const STATUSES: { key: string; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "success", label: "المشتريات الناجحة" },
  { key: "failed", label: "المشتريات الفاشلة" },
  { key: "refund", label: "المبلغ المسترد" },
];

const KIND_LABEL: Record<string, string> = {
  card: "شراء",
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

function statusBadge(kind: string, status: string) {
  const s = String(status || "").trim().toLowerCase();
  if (kind === "refund" || s === "refund" || s === "مسترد") return { cls: "bg-muted text-muted-foreground", text: "مسترد" };
  if (s === "failed" || s === "fail" || s === "cancelled" || s === "ملغاة" || s === "فاشلة" || s === "قيد التنفيذ")
    return { cls: "bg-red-500/15 text-red-400", text: "فاشلة" };
  if (s === "success" || s === "completed" || s === "ناجحة") return { cls: "bg-emerald-500/15 text-emerald-400", text: "ناجحة" };
  return { cls: "bg-red-500/15 text-red-400", text: "فاشلة" };
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
    refetchInterval: 60_000,
  });

  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bybit-ledger"] }),
  });

  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const t = setTimeout(() => sync.mutate(), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = q.data?.rows ?? [];
  const counts = (q.data?.counts ?? {}) as Record<string, number>;
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
                setStatus("all");
                setPage(1);
                setOpenId(null);
              }}
            >
              {g.label}
              {counts[g.key] !== undefined ? ` (${counts[g.key]!.toLocaleString("en-US")})` : ""}
            </Chip>
          ))}
        </div>
        <button
          type="button"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-3 py-1.5 text-xs hover:border-primary/60 disabled:opacity-60"
        >
          {sync.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          تحديث السجل
        </button>
      </div>

      <div className="rounded-3xl border border-border/60 bg-card/70 overflow-hidden">
        {group === "txns" && (
          <div className="flex flex-wrap items-center justify-start gap-1 p-4">
            {STATUSES.map((s) => (
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
        )}

        {q.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
        ) : !rows.length ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            لا توجد معاملات مسجّلة بعد — اضغط «تحديث السجل» لجلب حركات كل الحسابات.
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
                            <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                              <Detail label="الحساب" value={r.accountName} />
                              <Detail label="النوع" value={KIND_LABEL[r.kind] ?? r.kind} />
                              <Detail label="العملة" value={r.currency} />
                              <Detail label="الرسوم" value={r.fee ? amt(r.fee) : "—"} />
                              <Detail label="حالة المزوّد" value={r.status || "—"} />
                              <Detail label="معرّف المعاملة" value={r.refId} mono />
                              {Object.entries(r.detail ?? {}).map(([k, v]) =>
                                v === null || v === "" ? null : (
                                  <Detail key={k} label={k} value={String(v)} mono />
                                ),
                              )}
                            </div>
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

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/50 p-3">
      <div className="mb-1 text-[10px] text-muted-foreground">{label}</div>
      <div className={`truncate ${mono ? "font-mono text-[11px]" : "font-semibold"}`} dir={mono ? "ltr" : undefined}>
        {value}
      </div>
    </div>
  );
}
