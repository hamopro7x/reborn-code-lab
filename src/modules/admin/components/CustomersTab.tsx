import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { listCustomers } from "@/lib/admin.functions";
import { formatLocaleDateTime } from "@/lib/format";

function CustomersTab() {
  const list = useServerFn(listCustomers);
  const q = useQuery({ queryKey: ["admin-customers"], queryFn: () => list() as Promise<any[]> });
  const [search, setSearch] = useState("");
  const rows = (q.data ?? []).filter((r) => {
    const s = search.toLowerCase();
    return !s || r.email.toLowerCase().includes(s) || r.name.toLowerCase().includes(s) || r.phone.includes(s);
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold">العملاء ({q.data?.length ?? 0})</h2>
          <p className="text-xs text-muted-foreground">تحليل سلوك الشراء — العملاء المتكررون في الأعلى</p>
        </div>
        <Input placeholder="بحث بالاسم أو الإيميل أو الرقم..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      </div>
      <div className="space-y-3">
        {rows.map((c) => (
          <div key={c.email + c.phone} className={`card-surface rounded-2xl p-4 ${c.orders >= 2 ? "border-2 border-yellow-500/40" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-bold">{c.name}</div>
                  {c.orders >= 2 && (
                    <Badge className="bg-yellow-500 text-black gap-1">
                      <Repeat className="size-3" />عميل متكرر × {c.orders}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{c.email} · {c.phone} · {c.country}</div>
                <div className="text-[11px] text-muted-foreground mt-1">آخر طلب: {formatLocaleDateTime(c.last_at, "ar-EG")}</div>
              </div>
              <div className="text-left">
                <div className="text-xs text-muted-foreground">إجمالي المشتريات المؤكدة</div>
                <div className="space-y-0.5 mt-1">
                  {Object.entries(c.total_by_currency).map(([code, val]) => (
                    <div key={code} className="font-bold text-gradient text-sm">{Number(val).toFixed(2)} {code}</div>
                  ))}
                  {Object.keys(c.total_by_currency).length === 0 && <div className="text-xs text-muted-foreground">—</div>}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{c.confirmed} مؤكد / {c.orders} إجمالي</div>
              </div>
            </div>
            {c.orders >= 2 && (
              <a
                href={`https://wa.me/${c.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("مرحباً " + c.name + "، شكراً لثقتك بنا 🌟")}`}
                target="_blank" rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ArrowUpRight className="size-3" />تواصل عبر واتساب لعرض منتج جديد
              </a>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="card-surface rounded-2xl p-12 text-center text-muted-foreground">لا يوجد عملاء</div>}
      </div>
    </div>
  );
}

export { CustomersTab };
