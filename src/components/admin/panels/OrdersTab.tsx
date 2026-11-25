import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminOrders, getOrderScreenshotUrl } from "@/lib/orders-admin.queries";
import { updateAdminOrderStatus } from "@/lib/admin-orders.functions";
import { deleteAllOrders } from "@/lib/admin.functions";
import { formatLocaleDateTime } from "@/lib/format";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ExternalLink, Loader2, Trash2, X } from "lucide-react";

export function OrdersTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const deleteAllFn = useServerFn(deleteAllOrders);
  const updateOrderFn = useServerFn(updateAdminOrderStatus);
  const [deleting, setDeleting] = useState(false);
  const [filter, setFilter] = useState<string>("awaiting_confirmation");
  const [search, setSearch] = useState("");
  const ordersQ = useQuery({
    queryKey: ["admin-orders", filter, search],
    queryFn: async () => {
      return listAdminOrders(filter, search);
    },
  });

  async function updateStatus(id: string, status: string) {
    try {
      await updateOrderFn({ data: { id, status } });
      toast.success("تم التحديث");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (error: any) {
      toast.error(error?.message || "تعذر تحديث حالة الطلب");
    }
  }

  const statusLabel: Record<string, string> = {
    pending_payment: "بانتظار الدفع",
    awaiting_confirmation: "الطلبات الجديد",
    confirmed: "قيد التنفيذ",
    completed: "مكتمل",
    rejected: "مرفوض",
    cancelled: "ملغى",
  };

  const rows = (ordersQ.data ?? []).filter((o: any) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return (
      (o.order_code ?? "").toLowerCase().includes(s) ||
      (o.customer_name ?? "").toLowerCase().includes(s) ||
      (o.customer_email ?? "").toLowerCase().includes(s) ||
      (o.customer_phone ?? "").includes(s)
    );
  });

  async function handleDeleteAll() {
    const total = ordersQ.data?.length ?? 0;
    if (!total) { toast.info("لا توجد طلبات لحذفها"); return; }
    if (!confirm(`سيتم حذف كل الطلبات (${total}) نهائياً. هل أنت متأكد؟`)) return;
    if (!confirm("تأكيد أخير: هذا الإجراء لا يمكن التراجع عنه.")) return;
    setDeleting(true);
    try {
      const res = await deleteAllFn();
      toast.success(`تم حذف ${res.deleted} طلب`);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (e: any) {
      toast.error(e?.message || "فشل الحذف");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold">الطلبات ({ordersQ.data?.length ?? 0})</h2>
          <p className="text-xs text-muted-foreground">إدارة ومتابعة حالة الطلبات</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="اكتب كود الطلب"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          {isAdmin && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteAll}
              disabled={deleting}
              className="gap-1"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              حذف كل الطلبات
            </Button>
          )}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {[["awaiting_confirmation","الطلبات الجديد"],["confirmed","قيد التنفيذ"],["completed","مكتمل"],["cancelled","ملغى"]].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-lg text-xs ${filter === k ? "gradient-primary text-white" : "card-surface"}`}>{l}</button>
        ))}
      </div>
      <div className="space-y-3">
        {rows.map((o: any) => (
          <div key={o.id} className="card-surface rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-bold text-primary">{o.order_code}</span>
                  <Badge variant={o.status === "confirmed" || o.status === "completed" ? "default" : o.status === "rejected" || o.status === "cancelled" ? "destructive" : "secondary"}>{statusLabel[o.status] ?? o.status}</Badge>
                </div>
                <div className="text-sm"><strong>{o.customer_name}</strong> · {o.customer_email}</div>
                <div className="text-xs text-muted-foreground">{o.dial_code}{o.customer_phone} · {o.customer_country} · {formatLocaleDateTime(o.created_at, "ar-EG")}</div>
                <div className="mt-2 space-y-0.5 text-xs">
                  {(o.items ?? []).map((it: any) => <div key={it.id}>• {it.product_name} × {it.quantity} — {it.unit_price} {o.currency_code}</div>)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-black text-gradient">{o.total} {o.currency_code}</div>
                <div className="text-xs text-muted-foreground">{o.payment_method?.name}</div>
                {o.payment_screenshot && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const signedUrl = await getOrderScreenshotUrl(o.payment_screenshot as string);
                        window.open(signedUrl, "_blank", "noopener");
                      } catch {
                        toast.error("تعذر فتح الإثبات");
                      }
                    }}
                    className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
                  ><ExternalLink className="size-3" />الإثبات</button>
                )}
              </div>
            </div>
            {o.status !== "completed" && o.status !== "cancelled" && o.status !== "rejected" && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                {o.status !== "confirmed" && (
                  <Button size="sm" onClick={() => updateStatus(o.id, "confirmed")} className="bg-blue-600 hover:bg-blue-700 text-white gap-1"><Check className="size-4" />استلام الطلب</Button>
                )}
                <Button size="sm" onClick={() => updateStatus(o.id, "completed")} className="bg-green-600 hover:bg-green-700 text-white gap-1"><Check className="size-4" />تأكيد الطلب (مكتمل)</Button>
                <Button size="sm" variant="destructive" onClick={() => { if (confirm("إلغاء الطلب؟")) updateStatus(o.id, "cancelled"); }} className="gap-1"><X className="size-4" />إلغاء الطلب</Button>
                {o.status === "awaiting_confirmation" && (
                  <Button size="sm" variant="outline" onClick={() => { if (confirm("رفض الطلب؟")) updateStatus(o.id, "rejected"); }} className="gap-1"><X className="size-4" />رفض</Button>
                )}
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="card-surface rounded-2xl p-12 text-center text-muted-foreground">لا توجد طلبات</div>}
      </div>
    </div>
  );
}
