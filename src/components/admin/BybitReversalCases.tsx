import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBybitReversalCases, resolveBybitReversalCase } from "@/lib/bybit.functions";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { Check, X } from "lucide-react";

export function BybitReversalCases() {
  const list = useServerFn(getBybitReversalCases);
  const resolve = useServerFn(resolveBybitReversalCase);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const q = useQuery({ queryKey: ["bybit-reversal-cases"], queryFn: () => list(), refetchInterval: 5000, retry: false });
  async function decide(c: any, targetId: string | null) {
    if (!window.confirm(targetId ? `تأكيد عكس العملية ${targetId}؟` : "تأكيد إن ولا واحدة من العمليات دي اتعكست؟")) return;
    setBusy(true); setError("");
    try {
      await resolve({ data: { accountId: c.account_id, eventId: c.event_id, targetId, candidates: c.candidate_ids } });
      await Promise.all(["bybit-reversal-cases", "bybit-ledger", "bybit-spend-totals", "bybit-card-txns"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ القرار"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 border-y border-border py-4" dir="rtl">
    <h3 className="font-bold">مراجعة العكس</h3>
    {q.isPending && <p className="text-muted-foreground">جاري التحميل…</p>}
    {(q.error || error) && <p role="alert" className="text-destructive">{error || "تعذر تحميل المراجعة؛ تأكد من تطبيق إعدادات قاعدة البيانات."}</p>}
    {q.data?.cases.length === 0 && <p className="text-muted-foreground">مفيش أحداث عكس معلّقة</p>}
    {q.data?.cases.map((c: any) => <article key={`${c.account_id}:${c.event_id}`} className="rounded-md border border-border p-3 space-y-2">
      <div className="flex flex-wrap justify-between gap-2"><span>قيد مراجعة العكس</span><span className="break-all" dir="ltr">{c.event_id}</span></div>
      {c.rows.filter((r: any) => c.candidate_ids.includes(r.txn_id)).map((r: any) => <div key={r.txn_id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        <div className="min-w-0 space-y-1"><p>{r.merchant} · {r.pan4} · ${Math.abs(Number(r.amount)).toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(r.txn_time)} · tradeStatus {r.tradeStatus}</p>
          <p dir="ltr" className="break-all text-xs">{r.txn_id} · {r.orderNo}</p></div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(c, r.txn_id)}><Check />العملية دي اتعكست</Button>
      </div>)}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(c, null)}><X />ولا واحدة</Button>
    </article>)}
  </section>;
}