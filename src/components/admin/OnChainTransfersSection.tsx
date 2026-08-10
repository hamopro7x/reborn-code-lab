import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBybitActivity } from "@/lib/bybit.functions";
import { Badge } from "@/components/ui/badge";
import { ArrowDownToLine, ArrowUpFromLine, Layers } from "lucide-react";

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });
const when = (ms: number) => (ms ? new Date(ms).toLocaleString("ar-EG") : "—");

/** الأقسام — الاستلام والتحويل على السلسلة (إيداعات وسحب باي بت) */
export function OnChainTransfersSection() {
  const fetchActivity = useServerFn(getBybitActivity);

  const { data } = useQuery({
    queryKey: ["bybit-onchain-transfers"],
    queryFn: () => fetchActivity({ data: { days: 30 } }),
    refetchInterval: 30_000,
    retry: false,
  });

  const deposits = data?.deposits ?? [];
  const withdrawals = data?.withdrawals ?? [];

  return (
    <div className="rounded-2xl border bg-card overflow-hidden" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <Layers className="size-4" /> الأقسام
        </h3>
        <span className="text-xs text-muted-foreground">الاستلام والتحويل على السلسلة</span>
      </div>

      <div className="grid gap-3 p-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-background/60 p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ArrowDownToLine className="size-4" /> الاستلام
          </h4>
          {deposits.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد عمليات استلام في هذه الفترة.</p>
          ) : (
            <div className="space-y-2">
              {deposits.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="font-semibold text-emerald-500 tabular-nums">
                    +{num(d.amount)} {d.coin}
                  </span>
                  <span className="text-muted-foreground">{d.chain}</span>
                  <Badge variant="secondary">{d.status}</Badge>
                  <span className="text-xs text-muted-foreground">{when(d.at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-background/60 p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ArrowUpFromLine className="size-4" /> التحويل على السلسلة
          </h4>
          {withdrawals.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد عمليات تحويل في هذه الفترة.</p>
          ) : (
            <div className="space-y-2">
              {withdrawals.map((w) => (
                <div
                  key={w.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="font-semibold text-destructive tabular-nums">
                    -{num(w.amount)} {w.coin}
                  </span>
                  <span className="text-muted-foreground">رسوم: {num(w.fee)}</span>
                  <span className="text-muted-foreground">{w.chain}</span>
                  <Badge variant="secondary">{w.status}</Badge>
                  <span className="text-xs text-muted-foreground">{when(w.at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
