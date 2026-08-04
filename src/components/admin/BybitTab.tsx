import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBybitActivity } from "@/lib/bybit.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ArrowDownToLine, ArrowUpFromLine, Wallet, AlertTriangle } from "lucide-react";

type Coin = { coin: string; balance: number; usdValue: number };

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });
const when = (ms: number) => (ms ? new Date(ms).toLocaleString("ar-EG") : "—");

export function BybitTab() {
  const fetchActivity = useServerFn(getBybitActivity);
  const [days, setDays] = useState(30);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["bybit-activity", days],
    queryFn: () => fetchActivity({ data: { days } }),
    refetchInterval: days <= 30 ? 1_000 : 30_000,
    refetchIntervalInBackground: true,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalUsd = (data?.balances ?? []).reduce((s: number, c: Coin) => s + c.usdValue, 0);
  const depTotal = (data?.deposits ?? []).length;
  const wdTotal = (data?.withdrawals ?? []).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {[7, 30, 90, 180, 365].map((d) => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
            آخر {d} يوم
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      {(error || (data?.errors?.length ?? 0) > 0) && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm space-y-1">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> تنبيه من باي بت
          </div>
          {error && <p>{(error as Error).message}</p>}
          {data?.errors?.map((e) => (
            <p key={e} className="text-muted-foreground">{e}</p>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><Wallet className="h-4 w-4" /> إجمالي الرصيد</div>
          <div className="mt-1 text-2xl font-bold">${num(totalUsd)}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><ArrowDownToLine className="h-4 w-4" /> عدد الإيداعات</div>
          <div className="mt-1 text-2xl font-bold">{depTotal}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><ArrowUpFromLine className="h-4 w-4" /> عدد السحب</div>
          <div className="mt-1 text-2xl font-bold">{wdTotal}</div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {(data?.accounts ?? []).map((acc) => (
          <section key={acc.type} className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">{acc.label}</h3>
              <span className="text-sm text-muted-foreground">${num(acc.totalUsd)}</span>
            </div>
            {acc.kind === "internal" && (
              <div className="mb-3 rounded-lg border bg-muted/40 px-3 py-2">
                <div className="text-xs text-muted-foreground">قوة الشراء بعد الهامش</div>
                <div className="text-xl font-bold">
                  ${acc.spendingPower.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            )}
            {acc.coins.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد أرصدة في هذا الحساب.</p>
            ) : (
              <div className="space-y-2">
                {acc.coins.map((c: Coin) => (
                  <div key={c.coin} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span className="font-semibold">{c.coin}</span>
                    <span>{num(c.balance)}</span>
                    <span className="text-muted-foreground">${num(c.usdValue)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>


      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><ArrowDownToLine className="h-4 w-4" /> الإيداعات</h3>
        {(data?.deposits ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد إيداعات في هذه الفترة.</p>
        ) : (
          <div className="space-y-2">
            {data!.deposits.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="font-semibold">+{num(d.amount)} {d.coin}</span>
                <span className="text-muted-foreground">{d.chain}</span>
                <Badge variant="secondary">{d.status}</Badge>
                <span className="text-muted-foreground text-xs">{when(d.at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><ArrowUpFromLine className="h-4 w-4" /> السحب</h3>
        {(data?.withdrawals ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد عمليات سحب في هذه الفترة.</p>
        ) : (
          <div className="space-y-2">
            {data!.withdrawals.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="font-semibold">-{num(w.amount)} {w.coin}</span>
                <span className="text-muted-foreground">رسوم: {num(w.fee)}</span>
                <span className="text-muted-foreground">{w.chain}</span>
                <Badge variant="secondary">{w.status}</Badge>
                <span className="text-muted-foreground text-xs">{when(w.at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
