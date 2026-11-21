import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatLocaleDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, DollarSign, Loader2, Package, Repeat, ShoppingCart, TrendingUp, Users } from "lucide-react";

export function OverviewTab() {
  const qc = useQueryClient();
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [orders, products, users] = await Promise.all([
        supabase.from("orders").select("id,total,status,created_at"),
        supabase.from("products").select("id"),
        supabase.from("profiles").select("id"),
      ]);
      const ords = (orders.data ?? []) as any[];
      const revenue = ords.filter((o) => o.status === "confirmed" || o.status === "completed").reduce((s, o) => s + Number(o.total), 0);
      const pending = ords.filter((o) => o.status === "awaiting_confirmation").length;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayCount = ords.filter((o) => new Date(o.created_at) >= today).length;
      return {
        total: ords.length,
        revenue: revenue.toFixed(2),
        pending,
        todayCount,
        products: products.data?.length ?? 0,
        users: users.data?.length ?? 0,
      };
    },
  });
  const notifQ = useQuery({
    queryKey: ["admin-notifs"],
    queryFn: async () => (await supabase.from("admin_notifications").select("*").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });
  async function markRead(id: string) {
    await supabase.from("admin_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-notifs"] });
  }
  const s = stats.data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "إجمالي الطلبات", value: s?.total ?? "-", icon: ShoppingCart },
          { label: "الطلبات الجديد", value: s?.pending ?? "-", icon: Loader2 },
          { label: "طلبات اليوم", value: s?.todayCount ?? "-", icon: TrendingUp },
          { label: "الإيرادات (ج.م)", value: s?.revenue ?? "-", icon: DollarSign },
          { label: "المنتجات", value: s?.products ?? "-", icon: Package },
          { label: "العملاء", value: s?.users ?? "-", icon: Users },
        ].map((c) => (
          <div key={c.label} className="card-surface rounded-2xl p-4">
            <c.icon className="size-5 text-primary mb-2" />
            <div className="text-[11px] text-muted-foreground">{c.label}</div>
            <div className="text-xl md:text-2xl font-black mt-1">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="card-surface rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="size-5 text-primary" />
          <h3 className="font-bold">الإشعارات والتنبيهات</h3>
          {(notifQ.data ?? []).filter((n: any) => !n.read_at).length > 0 && (
            <Badge>{(notifQ.data ?? []).filter((n: any) => !n.read_at).length} جديد</Badge>
          )}
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {(notifQ.data ?? []).length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-6">لا توجد إشعارات</div>
          )}
          {(notifQ.data ?? []).map((n: any) => (
            <div key={n.id} className={`rounded-xl p-3 flex items-start gap-3 ${n.read_at ? "bg-muted/30" : "bg-primary/10 border border-primary/30"}`}>
              <div className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${n.kind === "repeat_customer" ? "bg-yellow-500/20 text-yellow-500" : "bg-primary/20 text-primary"}`}>
                {n.kind === "repeat_customer" ? <Repeat className="size-5" /> : <Bell className="size-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">{n.title}</div>
                {n.body && <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>}
                <div className="text-[10px] text-muted-foreground mt-1">{formatLocaleDateTime(n.created_at, "ar-EG")}</div>
              </div>
              {!n.read_at && (
                <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}><Check className="size-4" /></Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
