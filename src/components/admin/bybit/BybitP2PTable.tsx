import { usePersistentState } from "@/lib/persistent-state";
import { formatDateTime } from "@/lib/format";
import { Chip, Empty } from "@/components/admin/bybit/BybitVisuals";

export function P2PTable({ q }: { q: any }) {
  const [side, setSide] = usePersistentState<"all" | "buy" | "sell">("bybit.p2p.side", "buy");
  const rows: any[] = (q.data?.rows ?? []).filter((r: any) => r.status !== "pending");
  const shown = rows.filter((r) => (side === "all" ? true : r.side === side));

  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 overflow-hidden">
      <div className="flex items-center justify-start gap-1 p-4">
        <Chip active={side === "buy"} onClick={() => setSide("buy")}>شراء</Chip>
        <Chip active={side === "sell"} onClick={() => setSide("sell")}>بيع</Chip>
        <Chip active={side === "all"} onClick={() => setSide("all")}>الجميع</Chip>
      </div>
      {q.isLoading ? (
        <Empty text="جار التحميل…" />
      ) : q.data?.failed ? (
        <div className="p-6 text-center text-xs text-destructive" dir="ltr">{String(q.data.failed)}</div>
      ) : !shown.length ? (
        <Empty text="لا توجد طلبات P2P" />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="p-4 text-right font-normal">النوع / التاريخ</th>
                <th className="p-4 text-right font-normal">رقم الطلب</th>
                <th className="p-4 text-right font-normal">السعر</th>
                <th className="p-4 text-right font-normal">المبلغ / الكمية</th>
                <th className="p-4 text-right font-normal">الطرف المقابل</th>
                <th className="p-4 text-right font-normal">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                  <td className="p-4">
                    <div className="font-bold">
                      {r.coin} <span className={r.side === "buy" ? "text-emerald-400" : "text-destructive"}>{r.side === "buy" ? "شراء" : "بيع"}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground" dir="ltr">{formatDateTime(r.time)}</div>
                  </td>
                  <td className="p-4 font-mono text-xs" dir="ltr">{r.id}</td>
                  <td className="p-4" dir="ltr">{r.fiat} {r.price}</td>
                  <td className="p-4" dir="ltr">
                    <div>{r.fiat} {r.amount}</div>
                    <div className="text-[11px] text-muted-foreground">{r.coin} {r.quantity}</div>
                  </td>
                  <td className="p-4">{r.counterparty || "—"}</td>
                  <td className="p-4">
                    <span className={r.status === "اكتملت" ? "text-emerald-400" : r.status === "ملغاة" ? "text-destructive" : ""}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
