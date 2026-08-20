import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, TrendingUp, ShoppingCart, DollarSign, X } from "lucide-react";
import { toast } from "sonner";

type Period = "daily" | "monthly";

type OrderRow = {
  id: string;
  order_code: string;
  status: string;
  total: number;
  subtotal: number;
  discount_amount: number;
  currency_code: string;
  created_at: string;
};

const PAID = ["confirmed", "completed"];

function bucketKey(iso: string, period: Period) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  if (period === "monthly") return `${y}-${m}`;
  return `${y}-${m}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ReportsTab() {
  const [period, setPeriod] = useState<Period>("daily");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-reports-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, status, total, subtotal, discount_amount, currency_code, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });

  const filtered = useMemo(() => {
    return (orders ?? []).filter((o) => {
      const t = new Date(o.created_at).getTime();
      if (from && t < new Date(from + "T00:00:00").getTime()) return false;
      if (to && t > new Date(to + "T23:59:59").getTime()) return false;
      return true;
    });
  }, [orders, from, to]);

  const rows = useMemo(() => {
    const map = new Map<
      string,
      { key: string; currency: string; orders: number; paid: number; sales: number; net: number; discount: number }
    >();
    for (const o of filtered) {
      const k = `${bucketKey(o.created_at, period)}|${o.currency_code}`;
      let r = map.get(k);
      if (!r) {
        r = { key: bucketKey(o.created_at, period), currency: o.currency_code, orders: 0, paid: 0, sales: 0, net: 0, discount: 0 };
        map.set(k, r);
      }
      r.orders += 1;
      if (PAID.includes(o.status)) {
        r.paid += 1;
        r.sales += Number(o.total) || 0;
        r.net += (Number(o.subtotal) || 0) - (Number(o.discount_amount) || 0);
        r.discount += Number(o.discount_amount) || 0;
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [filtered, period]);

  const totals = useMemo(() => {
    const byCurrency: Record<string, { sales: number; net: number }> = {};
    let paid = 0;
    for (const r of rows) {
      byCurrency[r.currency] = byCurrency[r.currency] ?? { sales: 0, net: 0 };
      byCurrency[r.currency].sales += r.sales;
      byCurrency[r.currency].net += r.net;
      paid += r.paid;
    }
    return { byCurrency, paid, count: filtered.length };
  }, [rows, filtered]);

  function exportCsv() {
    if (!rows.length) return toast.error("لا توجد بيانات للتصدير");
    const header = ["الفترة", "العملة", "عدد الطلبات", "الطلبات المؤكدة", "إجمالي المبيعات", "صافي الأرباح", "الخصومات"];
    const lines = rows.map((r) =>
      [r.key, r.currency, r.orders, r.paid, r.sales.toFixed(2), r.net.toFixed(2), r.discount.toFixed(2)].join(","),
    );
    const csv = "\uFEFF" + [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير التقرير");
  }

  const grand = useMemo(() => {
    return rows.reduce(
      (a, r) => ({ orders: a.orders + r.orders, paid: a.paid + r.paid, sales: a.sales + r.sales, net: a.net + r.net, discount: a.discount + r.discount }),
      { orders: 0, paid: 0, sales: 0, net: 0, discount: 0 },
    );
  }, [rows]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }


  function applyPreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  }

  const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  return (
    <div className="space-y-4" dir="rtl">
      <div className="card-surface rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-border/60 p-1 bg-muted/20">
            {(["daily", "monthly"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 h-8 rounded-lg text-xs font-semibold transition-colors ${
                  period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "daily" ? "يومي" : "شهري"}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="size-4 ms-1" /> تصدير CSV
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">من تاريخ</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 w-full" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">إلى تاريخ</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 w-full" />
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label className="text-[11px] text-muted-foreground">فترات سريعة</Label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => applyPreset(1)}>اليوم</Button>
              <Button size="sm" variant="outline" onClick={() => applyPreset(7)}>7 أيام</Button>
              <Button size="sm" variant="outline" onClick={() => applyPreset(30)}>30 يوم</Button>
              <Button size="sm" variant="ghost" onClick={() => { setFrom(""); setTo(""); }}>
                <X className="size-3.5 ms-1" />مسح
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card-surface rounded-2xl p-4 border-s-2 border-s-primary/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <ShoppingCart className="size-4" /> إجمالي الطلبات
          </div>
          <div className="text-3xl font-black tabular-nums">{totals.count}</div>
        </div>
        <div className="card-surface rounded-2xl p-4 border-s-2 border-s-primary/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <TrendingUp className="size-4" /> الطلبات المؤكدة
          </div>
          <div className="text-3xl font-black tabular-nums">{totals.paid}</div>
        </div>
        <div className="card-surface rounded-2xl p-4 border-s-2 border-s-primary/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <DollarSign className="size-4" /> المبيعات حسب العملة
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            {Object.entries(totals.byCurrency).length === 0 && (
              <span className="text-lg font-black text-muted-foreground">—</span>
            )}
            {Object.entries(totals.byCurrency).map(([c, v]) => (
              <Badge key={c} variant="secondary" className="text-sm font-bold tabular-nums">
                {num(v.sales)} {c}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="card-surface rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead className="uppercase tracking-wide">
              <tr>
                <th className="text-start p-3 font-semibold">الفترة</th>
                <th className="text-start p-3 font-semibold">العملة</th>
                <th className="text-end p-3 font-semibold">الطلبات</th>
                <th className="text-end p-3 font-semibold">المؤكدة</th>
                <th className="text-end p-3 font-semibold">إجمالي المبيعات</th>
                <th className="text-end p-3 font-semibold">صافي الأرباح</th>
                <th className="text-end p-3 font-semibold">الخصومات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.key}-${r.currency}`} className="transition-colors">
                  <td className="p-3 font-semibold whitespace-nowrap">{r.key}</td>
                  <td className="p-3 text-muted-foreground">{r.currency}</td>
                  <td className="p-3 text-end tabular-nums">{r.orders}</td>
                  <td className="p-3 text-end tabular-nums">{r.paid}</td>
                  <td className="p-3 text-end tabular-nums">{num(r.sales)}</td>
                  <td className="p-3 text-end tabular-nums text-primary font-semibold">{num(r.net)}</td>
                  <td className="p-3 text-end tabular-nums text-muted-foreground">{num(r.discount)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-muted-foreground">
                    لا توجد بيانات في هذه الفترة
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="font-bold">
                <tr>
                  <td className="p-3" colSpan={2}>الإجمالي</td>
                  <td className="p-3 text-end tabular-nums">{grand.orders}</td>
                  <td className="p-3 text-end tabular-nums">{grand.paid}</td>
                  <td className="p-3 text-end tabular-nums">{num(grand.sales)}</td>
                  <td className="p-3 text-end tabular-nums text-primary">{num(grand.net)}</td>
                  <td className="p-3 text-end tabular-nums">{num(grand.discount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
