import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getP2POrderLinks } from "@/lib/work.functions";
import { formatDateTime } from "@/lib/format";

export function P2POrderLinks({ ledgerId }: { ledgerId: string }) {
  const read = useServerFn(getP2POrderLinks);
  const links = useQuery({ queryKey: ["p2p-order-links", ledgerId], queryFn: () => read({ data: { ledgerId } }) });
  return <section className="mt-4 border-t border-border pt-3">
    <h3 className="mb-2 text-sm font-bold">الشفتات المرتبطة</h3>
    {links.isPending ? <p className="text-xs text-muted-foreground">جاري التحميل…</p> : links.isError ? <p role="alert" className="text-xs text-destructive">{links.error.message}</p> : links.data.length ?
      <ul className="space-y-2 text-xs">{links.data.map((link, i) => <li key={`${link.shiftId}-${i}`}>
        {link.name} · {link.startedAt ? formatDateTime(link.startedAt) : "شفت سابق"}
        {!link.shiftId && <span className="block text-muted-foreground">الشفت محذوف — الرابط محفوظ</span>}
        {link.source === "legacy-assignment" && link.legacyGroup && <span className="block break-all text-muted-foreground">مجموعة تاريخية: {link.legacyGroup}</span>}
      </li>)}</ul> : <p className="text-xs text-muted-foreground">لا توجد روابط</p>}
  </section>;
}