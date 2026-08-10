import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBybitInternalTransfers } from "@/lib/bybit-internal.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Loader2 } from "lucide-react";

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });
const when = (ms: number) => (ms ? new Date(ms).toLocaleString("ar-EG") : "—");

const statusLabel = (s: string) => {
  const v = s.toLowerCase();
  if (/success|完成|3/.test(v)) return "تم التحويل بنجاح";
  if (/pending|processing/.test(v)) return "قيد المعالجة";
  if (/fail|reject|cancel/.test(v)) return "فاشلة";
  return s || "—";
};

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
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-right font-medium">عملة</th>
                <th className="px-3 py-2 text-right font-medium">نوع السلسلة</th>
                <th className="px-3 py-2 text-right font-medium">الكمية</th>
                {tab === "withdraw" && <th className="px-3 py-2 text-right font-medium">رسوم المعاملات</th>}
                <th className="px-3 py-2 text-right font-medium">العنوان</th>
                <th className="px-3 py-2 text-right font-medium">Txid</th>
                <th className="px-3 py-2 text-right font-medium">الحالة</th>
                <th className="px-3 py-2 text-right font-medium">التاريخ والوقت</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 font-semibold">{r.coin}</td>
                  <td className="px-3 py-2 text-primary">التحويل الداخلي</td>
                  <td
                    className={`px-3 py-2 tabular-nums font-semibold ${
                      tab === "withdraw" ? "text-destructive" : "text-emerald-500"
                    }`}
                  >
                    {tab === "withdraw" ? "-" : "+"}
                    {num(r.amount)}
                  </td>
                  {tab === "withdraw" && <td className="px-3 py-2 tabular-nums">{num(r.fee)}</td>}
                  <td className="px-3 py-2 text-muted-foreground">{r.address || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{shortId(r.txId)}</td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary">{statusLabel(r.status)}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{when(r.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
