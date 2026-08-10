import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBybitActivity } from "@/lib/bybit.functions";
import { Badge } from "@/components/ui/badge";
import { CoinIcon, ChainIcon } from "@/components/admin/CoinIcon";
import { dateLineAr, statusAr } from "@/lib/format-ar";
import { ArrowDownToLine, ArrowUpFromLine, Layers } from "lucide-react";

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

type TabKey = "deposits" | "withdrawals";

/** الأقسام — الاستلام والتحويل على السلسلة (إيداعات وسحب باي بت) */
export function OnChainTransfersSection() {
  const fetchActivity = useServerFn(getBybitActivity);
  const [tab, setTab] = useState<TabKey>("deposits");

  const { data } = useQuery({
    queryKey: ["bybit-onchain-transfers"],
    queryFn: () => fetchActivity({ data: { days: 30 } }),
    refetchInterval: 30_000,
    retry: false,
  });

  const deposits = data?.deposits ?? [];
  const withdrawals = data?.withdrawals ?? [];
  const rows: { id: string; coin: string; amount: number; fee?: number; chain: string; status: string; at: number }[] =
    tab === "deposits" ? deposits : withdrawals;

  const tabs: { key: TabKey; label: string; icon: typeof ArrowDownToLine; count: number }[] = [
    { key: "deposits", label: "الاستلام", icon: ArrowDownToLine, count: deposits.length },
    { key: "withdrawals", label: "التحويل على السلسلة", icon: ArrowUpFromLine, count: withdrawals.length },
  ];

  return (
    <div className="rounded-2xl border bg-card overflow-hidden" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <Layers className="size-4" /> الأقسام
        </h3>

        <nav className="flex items-center gap-1">
          {tabs.map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary/20 text-primary"
                    : "text-foreground/80 hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {t.label}
                <span className="text-xs text-muted-foreground tabular-nums">{t.count}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          {tab === "deposits" ? "لا توجد عمليات استلام في هذه الفترة." : "لا توجد عمليات تحويل في هذه الفترة."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm [&_th]:border [&_th]:border-border/60 [&_td]:border [&_td]:border-border/40">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-right font-semibold">عملة</th>
                <th className="px-4 py-3 text-right font-semibold">نوع السلسلة</th>
                <th className="px-4 py-3 text-right font-semibold">الكمية</th>
                <th className="px-4 py-3 text-right font-semibold">الرسوم</th>
                <th className="px-4 py-3 text-right font-semibold">الحالة</th>
                <th className="px-4 py-3 text-right font-semibold">التاريخ والوقت</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-semibold">
                      <CoinIcon coin={r.coin} />
                      <span>{r.coin || "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-sky-400">
                    <div className="flex items-center gap-2">
                      <ChainIcon chain={r.chain || ""} />
                      <span>{r.chain || "—"}</span>
                    </div>
                  </td>
                  <td
                    className={`px-4 py-3 tabular-nums font-semibold ${
                      tab === "deposits" ? "text-emerald-500" : "text-destructive"
                    }`}
                  >
                    {tab === "deposits" ? "+" : "-"}
                    {num(r.amount)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {num(r.fee ?? 0)} {r.coin || ""}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{statusAr(r.status)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{dateLineAr(r.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
