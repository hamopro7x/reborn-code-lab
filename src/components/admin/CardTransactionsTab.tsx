import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getBybitCardTransactions } from "@/lib/bybit.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, RefreshCw, Trash2, Copy, Globe, Wallet, CalendarDays, Link2 } from "lucide-react";
import { toast } from "sonner";

type Tx = {
  id: string;
  occurred_at: string;
  amount: number;
  currency_code: string;
  merchant: string;
  status: string;
  source: string;
  card_last4: string | null;
  notes: string | null;
};

const monthKey = (iso: string) => iso.slice(0, 7);
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function CardTransactionsTab() {
  const qc = useQueryClient();
  const [month, setMonth] = useState("");
  const [form, setForm] = useState({
    occurred_at: new Date().toISOString().slice(0, 10),
    amount: "",
    currency_code: "USD",
    merchant: "",
    status: "completed",
  });

  const { data: txs, isLoading } = useQuery({
    queryKey: ["card-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("card_transactions")
        .select("id, occurred_at, amount, currency_code, merchant, status, source, card_last4, notes")
        .order("occurred_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Tx[];
    },
    refetchInterval: 15000,
  });

  const { data: ingest } = useQuery({
    queryKey: ["card-ingest-token"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "card_ingest").maybeSingle();
      return ((data?.value as { token?: string } | null)?.token ?? "") as string;
    },
  });

  const saveToken = useMutation({
    mutationFn: async () => {
      const token = randomToken();
      const { error } = await supabase.from("site_settings").upsert({ key: "card_ingest", value: { token } });
      if (error) throw error;
      return token;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["card-ingest-token"] });
      toast.success("تم توليد مفتاح الرفع التلقائي");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addTx = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      if (!form.merchant.trim()) throw new Error("اكتب اسم الموقع / الجهة");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("اكتب مبلغ صحيح");
      const { error } = await supabase.from("card_transactions").insert({
        occurred_at: new Date(form.occurred_at).toISOString(),
        amount,
        currency_code: form.currency_code.toUpperCase(),
        merchant: form.merchant.trim(),
        status: form.status,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm((f) => ({ ...f, amount: "", merchant: "" }));
      qc.invalidateQueries({ queryKey: ["card-transactions"] });
      toast.success("تم تسجيل المعاملة");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delTx = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("card_transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["card-transactions"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const months = useMemo(() => {
    const set = new Set((txs ?? []).map((t) => monthKey(t.occurred_at)));
    return Array.from(set).sort().reverse();
  }, [txs]);

  const filtered = useMemo(
    () => (txs ?? []).filter((t) => !month || monthKey(t.occurred_at) === month),
    [txs, month],
  );

  const monthly = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const t of txs ?? []) {
      const k = monthKey(t.occurred_at);
      const inner = map.get(k) ?? new Map<string, number>();
      inner.set(t.currency_code, (inner.get(t.currency_code) ?? 0) + Number(t.amount));
      map.set(k, inner);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [txs]);

  const byMerchant = useMemo(() => {
    const map = new Map<string, { merchant: string; count: number; totals: Map<string, number> }>();
    for (const t of filtered) {
      const key = t.merchant.toLowerCase();
      const r = map.get(key) ?? { merchant: t.merchant, count: 0, totals: new Map<string, number>() };
      r.count += 1;
      r.totals.set(t.currency_code, (r.totals.get(t.currency_code) ?? 0) + Number(t.amount));
      map.set(key, r);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filtered]);

  const totals = useMemo(() => {
    const byCur = new Map<string, number>();
    for (const t of filtered) byCur.set(t.currency_code, (byCur.get(t.currency_code) ?? 0) + Number(t.amount));
    return Array.from(byCur.entries());
  }, [filtered]);

  const ingestUrl = typeof window !== "undefined" ? `${window.location.origin}/api/public/card-transactions` : "";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card-surface rounded-2xl p-4 border-s-2 border-s-primary/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Wallet className="size-4" /> إجمالي المصروف {month ? `(${month})` : "(الكل)"}
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            {totals.length === 0 && <span className="text-lg font-black text-muted-foreground">—</span>}
            {totals.map(([c, v]) => (
              <Badge key={c} variant="secondary" className="text-sm font-bold tabular-nums">
                {num(v)} {c}
              </Badge>
            ))}
          </div>
        </div>
        <div className="card-surface rounded-2xl p-4 border-s-2 border-s-primary/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <CalendarDays className="size-4" /> عدد المعاملات
          </div>
          <div className="text-3xl font-black tabular-nums">{filtered.length}</div>
        </div>
        <div className="card-surface rounded-2xl p-4 border-s-2 border-s-primary/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Globe className="size-4" /> عدد المواقع
          </div>
          <div className="text-3xl font-black tabular-nums">{byMerchant.length}</div>
        </div>
      </div>

      {/* month filter */}
      <div className="card-surface rounded-2xl p-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">الشهر:</span>
        <Button size="sm" variant={month === "" ? "default" : "outline"} onClick={() => setMonth("")}>
          الكل
        </Button>
        {months.map((m) => (
          <Button key={m} size="sm" variant={month === m ? "default" : "outline"} onClick={() => setMonth(m)}>
            {m}
          </Button>
        ))}
      </div>

      {/* monthly totals */}
      <div className="card-surface rounded-2xl overflow-hidden">
        <div className="p-3 text-sm font-bold border-b border-border/40">الإجمالي الشهري</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/20 border-b border-border/40">
              <tr>
                <th className="text-start p-3 font-semibold">الشهر</th>
                <th className="text-start p-3 font-semibold">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map(([m, cur]) => (
                <tr key={m} className="border-b border-border/20 last:border-0">
                  <td className="p-3 font-semibold">{m}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {Array.from(cur.entries()).map(([c, v]) => (
                        <Badge key={c} variant="outline" className="tabular-nums">
                          {num(v)} {c}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {monthly.length === 0 && (
                <tr>
                  <td colSpan={2} className="p-8 text-center text-muted-foreground">
                    لا توجد معاملات بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* by merchant */}
      <div className="card-surface rounded-2xl overflow-hidden">
        <div className="p-3 text-sm font-bold border-b border-border/40">
          المصروف حسب الموقع {month ? `— ${month}` : ""}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/20 border-b border-border/40">
              <tr>
                <th className="text-start p-3 font-semibold">الموقع / الجهة</th>
                <th className="text-end p-3 font-semibold">عدد المعاملات</th>
                <th className="text-start p-3 font-semibold">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {byMerchant.map((r) => (
                <tr key={r.merchant} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                  <td className="p-3 font-semibold">{r.merchant}</td>
                  <td className="p-3 text-end tabular-nums">{r.count}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {Array.from(r.totals.entries()).map(([c, v]) => (
                        <Badge key={c} variant="secondary" className="tabular-nums">
                          {num(v)} {c}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {byMerchant.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-muted-foreground">
                    لا توجد بيانات
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* manual add */}
      <div className="card-surface rounded-2xl p-4 space-y-3">
        <div className="text-sm font-bold">إضافة معاملة يدوياً</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">التاريخ</Label>
            <Input
              type="date"
              value={form.occurred_at}
              onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">المبلغ</Label>
            <Input
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="h-10"
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">العملة</Label>
            <Input
              value={form.currency_code}
              onChange={(e) => setForm({ ...form, currency_code: e.target.value })}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">الموقع / الجهة</Label>
            <Input
              value={form.merchant}
              onChange={(e) => setForm({ ...form, merchant: e.target.value })}
              className="h-10"
              placeholder="مثال: CapCut"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">الحالة</Label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="completed">مكتملة</option>
              <option value="pending">معلّقة</option>
              <option value="failed">مرفوضة</option>
              <option value="refunded">مستردة</option>
            </select>
          </div>
        </div>
        <Button onClick={() => addTx.mutate()} disabled={addTx.isPending}>
          {addTx.isPending ? <Loader2 className="size-4 animate-spin ms-1" /> : <Plus className="size-4 ms-1" />}
          تسجيل المعاملة
        </Button>
      </div>

      {/* auto ingest */}
      <div className="card-surface rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Link2 className="size-4" /> الرفع التلقائي للمعاملات
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          أي أداة (Zapier / Make / سكربت / إشعارات البريد) تبعت المعاملة على الرابط التالي بترويسة{" "}
          <code className="text-foreground">x-ingest-token</code> وهي بتتسجل هنا تلقائياً بدون إدخال يدوي.
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input readOnly value={ingestUrl} className="h-10 font-mono text-xs" />
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(ingestUrl);
              toast.success("تم نسخ الرابط");
            }}
          >
            <Copy className="size-4 ms-1" /> نسخ الرابط
          </Button>
          <Input
            readOnly
            value={ingest ? ingest : "لم يتم توليد مفتاح بعد"}
            className="h-10 font-mono text-xs"
          />
          <div className="flex gap-2">
            {ingest && (
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(ingest);
                  toast.success("تم نسخ المفتاح");
                }}
              >
                <Copy className="size-4 ms-1" /> نسخ
              </Button>
            )}
            <Button variant="secondary" onClick={() => saveToken.mutate()} disabled={saveToken.isPending}>
              {saveToken.isPending ? (
                <Loader2 className="size-4 animate-spin ms-1" />
              ) : (
                <RefreshCw className="size-4 ms-1" />
              )}
              {ingest ? "تجديد المفتاح" : "توليد مفتاح"}
            </Button>
          </div>
        </div>
        <pre className="text-[11px] bg-muted/30 rounded-xl p-3 overflow-x-auto text-muted-foreground" dir="ltr">
{`POST ${ingestUrl || "/api/public/card-transactions"}
x-ingest-token: <TOKEN>
content-type: application/json

{"external_id":"bybit-123","occurred_at":"2026-08-04T10:00:00Z",
 "amount":12.99,"currency_code":"USD","merchant":"CapCut","status":"completed"}`}
        </pre>
      </div>

      {/* list */}
      <div className="card-surface rounded-2xl overflow-hidden">
        <div className="p-3 text-sm font-bold border-b border-border/40">كل المعاملات</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/20 border-b border-border/40">
              <tr>
                <th className="text-start p-3 font-semibold">التاريخ</th>
                <th className="text-start p-3 font-semibold">الموقع / الجهة</th>
                <th className="text-end p-3 font-semibold">المبلغ</th>
                <th className="text-start p-3 font-semibold">الحالة</th>
                <th className="text-start p-3 font-semibold">المصدر</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                  <td className="p-3 whitespace-nowrap">{new Date(t.occurred_at).toLocaleDateString("ar-EG")}</td>
                  <td className="p-3 font-semibold">{t.merchant}</td>
                  <td className="p-3 text-end tabular-nums text-primary font-semibold">
                    {num(Number(t.amount))} {t.currency_code}
                  </td>
                  <td className="p-3">
                    <Badge variant={t.status === "completed" ? "secondary" : "outline"}>{t.status}</Badge>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{t.source === "auto" ? "تلقائي" : "يدوي"}</td>
                  <td className="p-3 text-end">
                    <Button size="icon" variant="ghost" onClick={() => delTx.mutate(t.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted-foreground">
                    لا توجد معاملات
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
