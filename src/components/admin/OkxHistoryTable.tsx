import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { getOkxHistory } from "@/lib/okx.functions";
import type { OkxHistoryKind, OkxInstrument } from "@/lib/okx-history";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function OkxHistoryTable({ accountId, kind }: { accountId: string; kind: OkxHistoryKind }) {
  const fn = useServerFn(getOkxHistory);
  const [cursors, setCursors] = useState<string[]>([]);
  const [instrument, setInstrument] = useState<OkxInstrument>("SPOT");
  const after = cursors[cursors.length - 1];
  const q = useQuery({
    queryKey: ["okx-history", accountId, kind, instrument, after],
    queryFn: () => fn({ data: { accountId, kind, instrument, after } }),
    staleTime: 30_000,
  });
  const failed = q.data?.failed || (q.error ? "تعذر تحميل السجلات، حاول تاني." : null);
  return <section className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{q.data?.periodLabel || "الدورة الحالية"}</span>
      <div className="flex items-center gap-2">
        {kind === "orders" && <Select value={instrument} onValueChange={(v) => { setInstrument(v as OkxInstrument); setCursors([]); }}>
          <SelectTrigger className="w-36" aria-label="نوع التداول"><SelectValue /></SelectTrigger>
          <SelectContent>{(["SPOT", "MARGIN", "SWAP", "FUTURES", "OPTION", "EVENTS"] as const).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
        </Select>}
        <Button variant="outline" size="icon" aria-label="تحديث السجلات" onClick={() => q.refetch()} disabled={q.isFetching}><RefreshCw className="size-4" /></Button>
      </div>
    </div>
    {failed ? <div className="text-sm text-destructive" role="alert">{failed}</div> : q.isLoading ? <Loader2 className="size-5 animate-spin" /> : <>
      <Table>
        <TableHeader><TableRow>{["التاريخ", "العملية", "العملة / الزوج", kind === "orders" ? "الكمية المنفذة" : "تغير الرصيد", "الرسوم", ...(kind === "orders" ? ["متوسط السعر"] : []), "الحالة", "المعرف"].map((h) => <TableHead className="whitespace-nowrap text-right" key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{q.data?.rows.map((r) => <TableRow key={r.id}>
          <TableCell className="whitespace-nowrap" dir="ltr">{new Date(r.time).toLocaleString("en-GB", { timeZone: "Africa/Cairo" })}</TableCell>
          <TableCell className="min-w-36">{r.label}{r.note && <div className="max-w-64 break-words text-xs text-muted-foreground">{r.note}</div>}</TableCell>
          <TableCell dir="ltr">{r.instrument || r.currency || "—"}</TableCell>
          <TableCell className="whitespace-nowrap tabular-nums" dir="ltr">{r.amount || "—"} {kind !== "orders" ? r.currency : ""}</TableCell>
          <TableCell className="whitespace-nowrap tabular-nums" dir="ltr">{r.fee === null ? "—" : `${r.fee || "0"} ${r.feeCurrency}`}</TableCell>
          {kind === "orders" && <TableCell dir="ltr">{r.price || "—"}</TableCell>}
          <TableCell className="whitespace-nowrap">{r.status}</TableCell><TableCell dir="ltr" className="text-xs">{r.id}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
      {!q.data?.rows.length && <div className="py-10 text-center text-sm text-muted-foreground">لا توجد سجلات في الفترة المعروضة</div>}
      <div className="flex items-center justify-end gap-3">
        <Button size="icon" variant="outline" aria-label="الصفحة السابقة" disabled={!cursors.length || q.isFetching} onClick={() => setCursors((c) => c.slice(0, -1))}><ChevronRight className="size-4" /></Button>
        <span className="text-xs tabular-nums">{cursors.length + 1}</span>
        <Button size="icon" variant="outline" aria-label="الصفحة التالية" disabled={!q.data?.nextCursor || q.isFetching} onClick={() => { const next = q.data?.nextCursor; if (next) setCursors((c) => [...c, next]); }}><ChevronLeft className="size-4" /></Button>
      </div>
    </>}
  </section>;
}