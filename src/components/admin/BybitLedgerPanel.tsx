import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownLeft, ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import { getBybitLedger, syncBybitLedger } from "@/lib/bybit.functions";

const KINDS: { key: string; label: string }[] = [
  { key: "all", label: "كل المعاملات" },
  { key: "card", label: "مشتريات الفيزا" },
  { key: "refund", label: "استرداد" },
  { key: "deposit", label: "إيداع (سلسلة)" },
  { key: "withdraw", label: "سحب (سلسلة)" },
  { key: "internal_in", label: "استلام داخلي" },
  { key: "internal_out", label: "تحويل داخلي" },
  { key: "p2p_buy", label: "شراء P2P" },
  { key: "p2p_sell", label: "بيع P2P" },
];

const kindLabel = (k: string) => KINDS.find((x) => x.key === k)?.label ?? k;

function fmtTime(ms: number) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtAmount(n: number) {
  return Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}

/** السجل المركزي: كل معاملة على أي حساب من حسابات الفيزا تُسجَّل هنا تلقائياً. */
export function BybitLedgerPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(getBybitLedger);
  const syncFn = useServerFn(syncBybitLedger);
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const q = useQuery({
    queryKey: ["bybit-ledger", kind, page],
    queryFn: () => listFn({ data: { kind, page, pageSize } }),
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
    <div className="relative z-10 rounded-3xl border border-border/60 bg-card/70 p-4 backdrop-blur-sm" dir="rtl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">سجل المعاملات المركزي</h3>
          <p className="text-[11px] text-muted-foreground">
            كل حركة مالية على أي حساب مرتبط تُسجَّل هنا تلقائياً — {total.toLocaleString("en-US")} سجل
          </p>
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

      <div className="mb-3 flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => {
              setKind(k.key);
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1 text-[11px] transition ${
              kind === k.key
                ? "border-primary/70 bg-primary/15 text-primary"
                : "border-border/60 text-muted-foreground hover:border-primary/40"
            }`}
          >
            {k.label}
            {counts[k.key] !== undefined ? ` (${counts[k.key]!.toLocaleString("en-US")})` : ""}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : !rows.length ? (
        <div className="p-8 text-center text-xs text-muted-foreground">
          لا توجد معاملات مسجّلة بعد — اضغط «تحديث السجل» لجلب حركات كل الحسابات.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-right text-xs">
            <thead className="text-[11px] text-muted-foreground">
              <tr className="border-b border-border/50">
                <th className="p-2 font-medium">الحساب</th>
                <th className="p-2 font-medium">النوع</th>
                <th className="p-2 font-medium">البيان</th>
                <th className="p-2 font-medium">المبلغ</th>
                <th className="p-2 font-medium">الرسوم</th>
                <th className="p-2 font-medium">الحالة</th>
                <th className="p-2 font-medium">التاريخ</th>
                <th className="p-2 font-medium">معرّف المعاملة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/30 last:border-0 hover:bg-white/[0.03]">
                  <td className="whitespace-nowrap p-2 font-medium">{r.accountName}</td>
                  <td className="whitespace-nowrap p-2 text-muted-foreground">{kindLabel(r.kind)}</td>
                  <td className="max-w-[220px] truncate p-2">{r.title}</td>
                  <td
                    className={`whitespace-nowrap p-2 font-semibold ${
                      r.direction === "in" ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {r.direction === "in" ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}
                      {fmtAmount(r.amount)} {r.currency}
                    </span>
                  </td>
                  <td className="whitespace-nowrap p-2 text-muted-foreground">{r.fee ? fmtAmount(r.fee) : "—"}</td>
                  <td className="whitespace-nowrap p-2 text-muted-foreground">{r.status || "—"}</td>
                  <td className="whitespace-nowrap p-2 text-muted-foreground">{fmtTime(r.time)}</td>
                  <td className="max-w-[160px] truncate p-2 font-mono text-[10px] text-muted-foreground" dir="ltr">
                    {r.refId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            className="rounded-lg border border-border/60 px-3 py-1 disabled:opacity-40"
          >
            السابق
          </button>
          <span className="text-muted-foreground">
            صفحة {page} / {pages}
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
  );
}
