import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getBybitActivity, getBybitCardTransactions } from "@/lib/bybit.functions";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, CreditCard, AlertTriangle, ChevronLeft } from "lucide-react";

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

const initials = (name: string) =>
  (name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();

export function CardTransactionsTab() {
  const fetchCard = useServerFn(getBybitCardTransactions);
  const fetchActivity = useServerFn(getBybitActivity);
  const [tab, setTab] = useState<"all" | "purchase" | "refund">("all");

  const { data: live, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["bybit-card-live"],
    queryFn: () => fetchCard({ data: { days: 1095 } }),
    refetchInterval: 30_000,
    retry: false,
  });

  const { data: activity } = useQuery({
    queryKey: ["bybit-activity", 30],
    queryFn: () => fetchActivity({ data: { days: 30 } }),
    refetchInterval: 30_000,
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
    refetchInterval: 30_000,
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

  const spent = rows.filter((r) => !isRefund(r)).reduce((s, r) => s + Math.abs(r.amount), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

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

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-background/60 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Total Spent</div>
              <div className="text-lg font-bold tabular-nums">${money(spent)}</div>
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

      {/* Recent Transactions — Bybit list layout */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between p-4 pb-2">
          <h3 className="text-base font-bold">Recent Transactions</h3>
          <span className="flex items-center text-xs text-muted-foreground">
            All <ChevronLeft className="size-3 rotate-180" />
          </span>
        </div>

        <div className="flex gap-1 px-4 pb-3">
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

        <div className="divide-y divide-border/40">
          {filtered.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">No transactions</div>
          )}
          {filtered.map((r) => {
            const refund = isRefund(r);
            const st = statusLabel(r.status);
            return (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                  {initials(r.merchant || "TX")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.merchant || "Card Purchase"}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {dateLine(r.occurredAt)}
                    {r.last4 ? ` · •••• ${r.last4}` : ""}
                  </div>
                </div>
                <div className="text-end">
                  <div
                    className={`text-sm font-bold tabular-nums ${
                      refund ? "text-emerald-500" : "text-foreground"
                    }`}
                  >
                    {refund ? "+" : "-"}
                    {money(r.amount)} {r.currency || "USD"}
                  </div>
                  <div
                    className={`text-[11px] ${
                      st === "Failed"
                        ? "text-destructive"
                        : st === "Pending"
                          ? "text-amber-500"
                          : "text-muted-foreground"
                    }`}
                  >
                    {st}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
