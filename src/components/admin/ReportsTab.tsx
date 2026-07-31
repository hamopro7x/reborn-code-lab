import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, TrendingUp, ShoppingCart, DollarSign } from "lucide-react";
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="card-surface rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">الفترة</Label>
          <div className="flex gap-1">
            <Button size="sm" variant={period === "daily" ? "default" : "outline"} onClick={() => setPeriod("daily")}>
              يومي
            </Button>
            <Button size="sm" variant={period === "monthly" ? "default" : "outline"} onClick={() => setPeriod("monthly")}>
              شهري
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">من تاريخ</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <Button size="sm" variant="outline" onClick={() => { setFrom(""); setTo(""); }}>
          مسح
        </Button>
        <Button size="sm" className="ms-auto" onClick={exportCsv}>
          <Download className="size-4 me-1" /> تصدير CSV
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card-surface rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <ShoppingCart className="size-4" /> إجمالي الطلبات
          </div>
          <div className="text-2xl font-bold">{totals.count}</div>
        </div>
        <div className="card-surface rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <TrendingUp className="size-4" /> الطلبات المؤكدة
          </div>
          <div className="text-2xl font-bold">{totals.paid}</div>
        </div>
        <div className="card-surface rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <DollarSign className="size-4" /> المبيعات حسب العملة
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            {Object.entries(totals.byCurrency).length === 0 && (
              <span className="text-sm text-muted-foreground">—</span>
            )}
            {Object.entries(totals.byCurrency).map(([c, v]) => (
              <Badge key={c} variant="secondary" className="text-sm">
                {v.sales.toLocaleString("en-US", { maximumFractionDigits: 2 })} {c}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="card-surface rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b border-border/40">
            <tr>
              <th className="text-start p-3">الفترة</th>
              <th className="text-start p-3">العملة</th>
              <th className="text-start p-3">الطلبات</th>
              <th className="text-start p-3">المؤكدة</th>
              <th className="text-start p-3">إجمالي المبيعات</th>
              <th className="text-start p-3">صافي الأرباح</th>
              <th className="text-start p-3">الخصومات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.key}-${r.currency}`} className="border-b border-border/20 last:border-0">
                <td className="p-3 font-medium">{r.key}</td>
                <td className="p-3">{r.currency}</td>
                <td className="p-3">{r.orders}</td>
                <td className="p-3">{r.paid}</td>
                <td className="p-3">{r.sales.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                <td className="p-3 text-primary font-semibold">
                  {r.net.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </td>
                <td className="p-3">{r.discount.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  لا توجد بيانات في هذه الفترة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
