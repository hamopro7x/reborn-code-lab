import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listBybitReversalReviews, resolveBybitReversalReview } from "@/lib/bybit.functions";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";

/** Admin-only queue: Bybit reversals that cannot be tied to one purchase from Bybit data alone. */
export function BybitReversalReview() {
  const listFn = useServerFn(listBybitReversalReviews);
  const resolveFn = useServerFn(resolveBybitReversalReview);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["bybit-reversal-reviews"],
    queryFn: () => listFn(),
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const items = q.data?.items ?? [];
  if (!items.length) return null;

  const decide = async (accountId: string, reversalId: string, voidedId: string | null) => {
    setBusy(reversalId);
    try {
      await resolveFn({ data: { accountId, reversalId, voidedId } });
      toast.success("اتسجل القرار");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["bybit-reversal-reviews"] }),
        qc.invalidateQueries({ queryKey: ["bybit-ledger"] }),
        qc.invalidateQueries({ queryKey: ["bybit-spend-totals"] }),
      ]);
    } catch (e) {
      toast.error((e as Error)?.message || "تعذّر حفظ القرار");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 space-y-3" dir="rtl">
      <div className="font-bold">مراجعة العكس ({items.length})</div>
      <p className="text-xs text-muted-foreground">
        باي بت بعت عكس بدون ما يحدد أنهي عملية. اختار العملية اللي اتعكست حسب تطبيق باي بت. لحد ما تختار، المبلغ مخصوم مرة واحدة من الصرف ومحدش اتعلّم عليه فاشل.
      </p>
      {items.map((it) => (
        <div key={`${it.accountId}|${it.reversalId}`} className="rounded-xl border border-border/60 bg-background/60 p-3 space-y-2">
          <div className="text-sm">
            <span className="font-bold">{it.accountName}</span> · ****{it.pan4} · {it.merchant} ·{" "}
            <span dir="ltr">{it.amount.toFixed(2)} USD</span> · عكس {formatDateTime(new Date(it.time).toISOString())}
          </div>
          {it.legacyId ? (
            <div className="text-xs text-muted-foreground">فيه علامة قديمة تلقائية على {it.legacyId} — محتاجة تأكيد.</div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {it.candidates.map((c) => (
              <Button
                key={c.txnId}
                size="sm"
                variant={it.legacyId === c.txnId ? "destructive" : "outline"}
                disabled={busy === it.reversalId}
                onClick={() => decide(it.accountId, it.reversalId, c.txnId)}
              >
                اتعكست: {formatDateTime(new Date(c.time).toISOString())} ({c.tradeStatus === "0" ? "قيد التنفيذ" : "مكتملة"})
              </Button>
            ))}
            <Button size="sm" variant="ghost" disabled={busy === it.reversalId} onClick={() => decide(it.accountId, it.reversalId, null)}>
              ولا واحدة
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
