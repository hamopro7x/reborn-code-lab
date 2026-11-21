import { Loader2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { P2PShiftLinkMenu } from "@/components/admin/P2PShiftLinkMenu";
import { statusBadge } from "@/components/admin/BybitLedgerPanel";
import { num } from "@/components/admin/EmployeeWorkFormatters";

const P2P_COLUMNS = [
  "النوع",
  "التاريخ / الوقت",
  "السعر",
  "المبلغ / الكمية",
  "الطرف المقابل",
  "الحالة",
  "صاحب الطلب",
];



export function P2POrdersTable({
  rows,
  loading,
  onDetails,
  onLinked,
  readOnly,
}: {
  rows: any[];
  loading?: boolean;
  onDetails: (row: any) => void;
  onLinked?: () => void;
  /** أدمن يشاهد سجل شفت — بدون ربط. */
  readOnly?: boolean;
}) {
  const emptyRows = Math.max(8 - rows.length, 0);
  const columns = [...P2P_COLUMNS.filter((c) => c !== "صاحب الطلب"), "الشفتات المرتبطة", ...(!readOnly ? ["الإجراء"] : [])];

  return (
    <div className="data-surface">
      <div className="overflow-x-auto">
        <table className="data-table min-w-[900px] text-center">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="py-8">
                  <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const d = (r.detail ?? {}) as Record<string, unknown>;
                const badge = statusBadge(String(r.kind), String(r.status ?? ""));
                const fiat = String(d["fiat"] ?? "");
                const isSell = /sell/i.test(String(r.kind));
                return (
                  <tr key={r.assignmentId ?? r.ledgerId}>
                    <td className="font-bold">
                      <span className={isSell ? "text-destructive" : "text-emerald-400"}>
                        {isSell ? "بيع" : "شراء"}
                      </span>{" "}
                      <span>{String(r.currency ?? "USDT")}</span>
                    </td>
                    <td className="text-xs text-muted-foreground tabular-nums">{formatDateTime(r.time)}</td>
                    <td className="tabular-nums" dir="ltr">
                      {d["price"] ? `${fiat} ${d["price"]}` : "—"}
                    </td>
                    <td className="tabular-nums" dir="ltr">
                      <div className="font-bold">{d["fiatAmount"] ? `${fiat} ${d["fiatAmount"]}` : "—"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {String(r.currency ?? "")} {num(Math.abs(Number(r.amount)))}
                      </div>
                    </td>
                    <td className="text-xs">{String(d["counterparty"] ?? "—") || "—"}</td>
                    <td>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </td>
                    <td className="min-w-48 text-xs">
                      {(r.relatedShifts ?? []).length ? (r.relatedShifts ?? []).map((link: any, index: number) => (
                        <div key={`${link.shiftId ?? "deleted"}-${index}`} className="py-1">
                          <span>{link.name} · {link.startedAt ? formatDateTime(link.startedAt) : "شفت سابق"}</span>
                          {!link.shiftId && <span className="block text-muted-foreground">الشفت محذوف — الرابط محفوظ</span>}
                          {link.legacyGroup && link.source === "legacy-assignment" && <span className="block text-muted-foreground">مجموعة تاريخية: {link.legacyGroup}</span>}
                        </div>
                      )) : "—"}
                    </td>
                    {!readOnly && <td><P2PShiftLinkMenu ledgerId={String(r.ledgerId)} onLinked={onLinked} /></td>}

                  </tr>
                );
              })
            )}
            {Array.from({ length: emptyRows }).map((_, i) => (
              <tr key={`p2p-empty-${i}`}>
                {columns.map((c) => (
                  <td key={c}>&nbsp;</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
