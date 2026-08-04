import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getBybitActivity, getBybitCardRewards, getBybitCardTransactions } from "@/lib/bybit.functions";
import { Button } from "@/components/ui/button";
import { RefreshCw, CreditCard, AlertTriangle } from "lucide-react";

type Row = {
  id: string;
  occurredAt: number;
  amount: number;
  currency: string;
  merchant: string;
  status: string;
  last4: string;
};

const money = (n: number) =>
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateLine = (ms: number) =>
  ms
    ? new Date(ms).toLocaleString("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "—";

const isRefund = (r: Row) => r.amount > 0 || /refund|reversal|cashback/i.test(r.status + r.merchant);

const statusLabel = (s: string) => {
  const v = s.toLowerCase();
  if (!s) return "Successful";
  if (/success|completed|filled|done/.test(v)) return "Successful";
  if (/pending|processing/.test(v)) return "Pending";
  if (/fail|reject|declin/.test(v)) return "Failed";
  return s;
};


export function CardTransactionsTab() {
  const fetchCard = useServerFn(getBybitCardTransactions);
  const fetchActivity = useServerFn(getBybitActivity);
  const fetchRewards = useServerFn(getBybitCardRewards);
  const [tab, setTab] = useState<"all" | "purchase" | "refund">("all");

  const { data: rewards } = useQuery({
    queryKey: ["bybit-card-rewards"],
    queryFn: () => fetchRewards(),
    refetchInterval: 60_000,
    retry: false,
  });

  const { data: live, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["bybit-card-live"],
    queryFn: () => fetchCard(),
    refetchInterval: 10_000,
    retry: false,
  });

  const { data: activity } = useQuery({
    queryKey: ["bybit-activity", 30],
    queryFn: () => fetchActivity({ data: { days: 30 } }),
    refetchInterval: 10_000,
    retry: false,
  });

  const { data: stored } = useQuery({
    queryKey: ["card-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("card_transactions")
        .select("id, occurred_at, amount, currency_code, merchant, status, card_last4")
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5_000,
  });

  const internal = (activity?.accounts ?? []).find((a) => a.kind === "internal");
  const spendingPower = internal?.spendingPower ?? 0;
  const liveError = (live?.errors ?? [])[0];

  const rows = useMemo<Row[]>(() => {
    const a: Row[] = (live?.rows ?? []) as Row[];
    const b: Row[] = (stored ?? []).map((t: any) => ({
      id: t.id,
      occurredAt: new Date(t.occurred_at).getTime(),
      amount: -Math.abs(Number(t.amount)),
      currency: t.currency_code,
      merchant: t.merchant,
      status: t.status,
      last4: t.card_last4 ?? "",
    }));
    return [...a, ...b].sort((x, y) => y.occurredAt - x.occurredAt);
  }, [live, stored]);

  const filtered = rows.filter((r) =>
    tab === "all" ? true : tab === "refund" ? isRefund(r) : !isRefund(r),
  );

  // الإنفاق الشهري (الشهر الحالي، المشتريات فقط)
  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }, []);
  const monthlySpend = rows
    .filter((r) => !isRefund(r) && r.occurredAt >= monthStart)
    .reduce((s, r) => s + Math.abs(r.amount), 0);

  // نسبة الاستراداد النقدي — تلقائي من المنصة، وإن لم تتوفر تُحسب من المعاملات
  const platformRate = rewards?.rate ?? null;
  const refunded = rows
    .filter((r) => isRefund(r) && r.occurredAt >= monthStart)
    .reduce((s, r) => s + Math.abs(r.amount), 0);
  const derivedRate = monthlySpend > 0 ? (refunded / monthlySpend) * 100 : null;
  const cashbackRate = platformRate ?? derivedRate;
  const spendForRate = rewards?.monthlySpend ?? monthlySpend;
  const cashbackEarned = cashbackRate == null ? null : (spendForRate * cashbackRate) / 100;




  return (
    <div className="space-y-4" dir="ltr">
      {/* Card hero — Bybit Card dashboard style */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="p-5 md:p-6 bg-gradient-to-br from-muted/60 to-transparent">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Available Balance</div>
              <div className="mt-1 text-4xl font-black tracking-tight tabular-nums">
                ${money(spendingPower)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Spending Power · Bybit Card
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex h-12 w-20 items-center justify-center rounded-lg bg-foreground/90 text-background text-xs font-bold">
                <CreditCard className="size-4 me-1" /> Card
              </div>
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-background/60 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Monthly Spend</div>
              <div className="text-lg font-bold tabular-nums">${money(spendForRate)}</div>
              <div className="text-[10px] text-muted-foreground">
                {rows.length === 0 ? "يبدأ العد من أول معاملة جديدة" : "الشهر الحالي · المشتريات"}
              </div>
            </div>
            <div className="rounded-xl border bg-background/60 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">
                Cashback Rate{rewards?.tier ? ` · ${rewards.tier}` : ""}
              </div>
              <div className="text-lg font-bold tabular-nums">
                {cashbackRate == null ? "—" : `${cashbackRate.toFixed(2)}%`}
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                {cashbackEarned != null
                  ? `≈ $${money(cashbackEarned)} cashback`
                  : platformRate == null
                    ? "باي بت لا تتيح Pay Rewards عبر الـ API"
                    : "auto · Bybit"}
              </div>
            </div>

            <div className="rounded-xl border bg-background/60 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Transactions</div>
              <div className="text-lg font-bold tabular-nums">{rows.length}</div>
            </div>
            <div className="rounded-xl border bg-background/60 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Currency</div>
              <div className="text-lg font-bold">USD</div>
            </div>
          </div>
        </div>
      </div>

      {liveError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs flex items-start gap-2">
          <AlertTriangle className="size-4 mt-0.5" />
          <span className="text-muted-foreground">{liveError}</span>
        </div>
      )}

      {/* Transactions — Bybit table layout */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-3">
          <h3 className="text-base font-bold">Transactions</h3>
          <div className="flex gap-1">
            {(
              [
                ["all", "All"],
                ["purchase", "Purchases"],
                ["refund", "Refunds"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  tab === key
                    ? "bg-foreground text-background"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-y bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-start font-semibold">Action</th>
                <th className="px-4 py-3 text-start font-semibold">Card's Last 4 Digits</th>
                <th className="px-4 py-3 text-start font-semibold">Transaction Date &amp; Time</th>
                <th className="px-4 py-3 text-start font-semibold">Status</th>
                <th className="px-4 py-3 text-end font-semibold">Total Authorization Amount</th>
                <th className="px-4 py-3 text-end font-semibold">Merchant Name</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                    {isLoading ? "جاري جلب المعاملات من باي بت…" : "No transactions"}
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const refund = isRefund(r);
                const st = statusLabel(r.status);
                const failed = st === "Failed";
                return (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="px-4 py-4">
                      <button className="font-medium text-amber-500 hover:underline">Details</button>
                    </td>
                    <td className="px-4 py-4 font-bold tabular-nums">{r.last4 || "••••"}</td>
                    <td className="px-4 py-4 text-muted-foreground tabular-nums">{dateLine(r.occurredAt)}</td>
                    <td
                      className={`px-4 py-4 ${
                        failed
                          ? "text-muted-foreground"
                          : st === "Pending"
                            ? "text-amber-500"
                            : "text-foreground"
                      }`}
                    >
                      {st}
                    </td>
                    <td
                      className={`px-4 py-4 text-end font-semibold tabular-nums ${
                        failed ? "text-muted-foreground" : refund ? "text-emerald-500" : "text-destructive"
                      }`}
                    >
                      {refund ? "+" : "-"}
                      {r.currency || "USD"} {money(r.amount)}
                    </td>
                    <td className="px-4 py-4 text-end font-medium">{r.merchant || "Card Purchase"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
