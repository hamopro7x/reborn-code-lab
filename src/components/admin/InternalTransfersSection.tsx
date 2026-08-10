import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBybitInternalTransfers } from "@/lib/bybit-internal.functions";
import { Badge } from "@/components/ui/badge";
import { CoinIcon } from "@/components/admin/CoinIcon";
import { dateLineAr, statusAr } from "@/lib/format-ar";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ChevronDown, Loader2 } from "lucide-react";


const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });


type TabKey = "withdraw" | "deposit";
type Row = {
  id: string;
  coin: string;
  amount: number;
  fee: number;
  status: string;
  address: string;
  txId: string;
  at: number;
  createdAt: number;
  chain: string;
};

/** السحب والتحويل الداخلي — سجل حساب التمويل في باي بت */
export function InternalTransfersSection() {
  const fetchTransfers = useServerFn(getBybitInternalTransfers);
  const [tab, setTab] = useState<TabKey>("withdraw");
  const [detail, setDetail] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["bybit-internal-transfers"],
    queryFn: () => fetchTransfers({ data: { days: 90 } }),
    refetchInterval: 30_000,
    retry: false,
  });

  const withdrawals = data?.withdrawals ?? [];
  const deposits = data?.deposits ?? [];
  const rows = tab === "withdraw" ? withdrawals : deposits;

  const tabs: { key: TabKey; label: string; icon: typeof ArrowUpFromLine; count: number }[] = [
    { key: "withdraw", label: "سحب", icon: ArrowUpFromLine, count: withdrawals.length },
    { key: "deposit", label: "إيداع", icon: ArrowDownToLine, count: deposits.length },
  ];

  return (
    <div className="rounded-2xl border bg-card overflow-hidden" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <h3 className="text-base font-bold">سجل حساب التمويل — التحويل الداخلي</h3>
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

      {(data?.errors?.length ?? 0) > 0 && (
        <p className="border-b px-4 py-2 text-xs text-muted-foreground">{data?.errors?.[0]}</p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">لا توجد عمليات تحويل داخلي في هذه الفترة.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm [&_th]:border [&_th]:border-border/60 [&_td]:border [&_td]:border-border/40">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-right font-semibold">عملة</th>
                <th className="px-4 py-3 text-right font-semibold">نوع السلسلة</th>
                <th className="px-4 py-3 text-right font-semibold">الكمية</th>
                <th className="px-4 py-3 text-right font-semibold">العنوان</th>
                <th className="px-4 py-3 text-right font-semibold">الحالة</th>
                <th className="px-4 py-3 text-right font-semibold">التاريخ والوقت</th>
                <th className="px-4 py-3 text-right font-semibold">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-t hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-semibold">
                          <CoinIcon coin={r.coin} />
                          <span>{r.coin || "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-sky-400">التحويل الداخلي</td>
                      <td
                        className={`px-4 py-3 tabular-nums font-semibold ${
                          tab === "withdraw" ? "text-destructive" : "text-emerald-500"
                        }`}
                      >
                        {tab === "withdraw" ? "-" : "+"}
                        {num(r.amount)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.address || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{statusAr(r.status)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{dateLineAr(r.at)}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : r.id)}
                          className="flex items-center gap-1 font-semibold text-amber-500 hover:underline"
                        >
                          التفاصيل
                          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-muted/10">
                        <td colSpan={7} className="p-0">
                          <div dir="rtl" className="grid gap-6 px-4 py-5 sm:grid-cols-2 sm:px-8">
                            <ol className="space-y-3">
                              {[
                                {
                                  label: tab === "withdraw" ? "تم إرسال طلب السحب" : "تم إرسال الإيداع",
                                  at: r.createdAt,
                                },
                                { label: "جاري المعالجة", at: r.createdAt },
                                {
                                  label: tab === "withdraw" ? "اكتملت عملية السحب" : "اكتمل الإيداع",
                                  at: r.at,
                                },
                              ].map((s, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                                  <div>
                                    <div className="text-sm font-semibold">{s.label}</div>
                                    <div className="text-xs text-muted-foreground">{dateLineAr(s.at)}</div>
                                  </div>
                                </li>
                              ))}
                            </ol>

                            <dl className="rounded-xl bg-muted/40 p-4 text-sm">
                              {[
                                ["الحالة", statusAr(r.status)],
                                ["الوقت", dateLineAr(r.createdAt || r.at)],
                                [tab === "withdraw" ? "حساب السحب" : "حساب الإيداع", "التمويل"],
                                ["عملة", r.coin || "—"],
                                ["الكمية", num(r.amount)],
                                ["نوع السلسلة", "التحويل الداخلي"],
                                ["العنوان", r.address || "—"],
                                ["Txid", r.txId || "—"],
                              ].map(([k, v]) => (
                                <div key={k} className="flex items-start justify-between gap-4 py-1.5">
                                  <dt className="text-muted-foreground">{k}</dt>
                                  <dd className="break-all text-right font-medium">{v}</dd>
                                </div>
                              ))}
                            </dl>
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

    </div>
  );
}
