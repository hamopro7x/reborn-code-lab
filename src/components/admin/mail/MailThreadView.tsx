import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight, Mail, Reply, Star, Archive, RotateCcw, Trash2, Paperclip } from "lucide-react";
import { MailMessageBody } from "@/components/admin/MailMessageBody";
import { MailComposer } from "@/components/admin/mail/MailComposer";
import { fmt, sender } from "@/components/admin/mail/MailFormatting";
import { livePoll } from "@/lib/live-poll";
import { getMailThread, setMailRead, organizeMail, downloadMailAttachment, listMailActivity } from "@/lib/mail.functions";

export function MailThreadView({ id, isAdmin, accounts, labels, onBack }: { id: string; isAdmin: boolean; accounts: any[]; labels: any[]; onBack: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getMailThread);
  const readFn = useServerFn(setMailRead);
  const orgFn = useServerFn(organizeMail);
  const attFn = useServerFn(downloadMailAttachment);
  const q = useQuery({ queryKey: ["mail-thread", id], queryFn: () => getFn({ data: { id } }) });
  const [replyTo, setReplyTo] = useState<any | null>(null);
  useEffect(() => { qc.invalidateQueries({ queryKey: ["mail-msgs"] }); }, [q.data, qc]);
  const msg = q.data?.thread.find((m: any) => m.id === id);
  const acct = accounts.find((a) => a.id === msg?.account_id);

  const act = async (f: () => Promise<any>, ok: string, back = false) => {
    try { await f(); toast.success(ok); qc.invalidateQueries({ queryKey: ["mail-msgs"] }); qc.invalidateQueries({ queryKey: ["mail-thread", id] }); if (back) onBack(); }
    catch (e: any) { toast.error(e?.message ?? "حدث خطأ"); }
  };
  const download = async (a: any) => {
    try {
      const r = await attFn({ data: { id: a.id } });
      const bin = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bin], { type: r.mimeType }));
      const el = document.createElement("a");
      el.href = url; el.download = r.filename; el.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) { toast.error(e?.message ?? "تعذر التحميل"); }
  };

  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (q.error || !msg) return <p className="text-destructive">{(q.error as Error)?.message ?? "غير موجودة"}</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowRight className="ms-1 h-4 w-4" />رجوع</Button>
        <Button variant="outline" size="sm" onClick={() => act(() => readFn({ data: { ids: [id], read: false } }), "تم التعليم كغير مقروء", true)}><Mail className="ms-1 h-4 w-4" />غير مقروء</Button>
        {isAdmin && (
          <>
            <Button variant="outline" size="sm" onClick={() => setReplyTo(msg)}><Reply className="ms-1 h-4 w-4" />رد</Button>
            <Button variant="outline" size="sm" onClick={() => act(() => orgFn({ data: { ids: [id], action: msg.starred ? "unstar" : "star" } }), "تم")}><Star className={`ms-1 h-4 w-4 ${msg.starred ? "fill-primary text-primary" : ""}`} />تمييز</Button>
            <Button variant="outline" size="sm" onClick={() => act(() => orgFn({ data: { ids: [id], action: msg.archived ? "unarchive" : "archive" } }), "تم", true)}><Archive className="ms-1 h-4 w-4" />{msg.archived ? "إلغاء الأرشفة" : "أرشفة"}</Button>
            {msg.trashed_at ? (
              <>
                <Button variant="outline" size="sm" onClick={() => act(() => orgFn({ data: { ids: [id], action: "restore" } }), "تمت الاستعادة", true)}><RotateCcw className="ms-1 h-4 w-4" />استعادة</Button>
                <Button variant="destructive" size="sm" onClick={() => confirm("حذف نهائي من الموقع؟ (Gmail لن يتأثر)") && act(() => orgFn({ data: { ids: [id], action: "delete" } }), "تم الحذف", true)}>حذف نهائي</Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => act(() => orgFn({ data: { ids: [id], action: "trash" } }), "نُقلت للمحذوفات", true)}><Trash2 className="ms-1 h-4 w-4" />حذف</Button>
            )}
            {labels.length > 0 && (
              <select className="rounded-md border border-input bg-background p-1 text-sm" value="" onChange={(e) => {
                const l = e.target.value; if (!l) return;
                act(() => orgFn({ data: { ids: [id], action: msg.label_ids?.includes(l) ? "remove_label" : "add_label", labelId: l } }), "تم");
              }}>
                <option value="">تصنيف…</option>
                {labels.map((l) => <option key={l.id} value={l.id}>{msg.label_ids?.includes(l.id) ? "✓ " : ""}{l.name}</option>)}
              </select>
            )}
          </>
        )}
      </div>
      <h3 className="text-lg font-bold">{msg.subject || "(بدون عنوان)"}</h3>
      <p className="text-xs text-muted-foreground">الحساب المستلم: <span dir="ltr">{acct?.email ?? "—"}</span></p>
      {q.data!.thread.map((m: any) => {
        const atts = q.data!.attachments.filter((a: any) => a.message_id === m.id);
        return (
          <div key={m.id} className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
              <b dir="ltr">{m.from_addr}</b><span className="text-muted-foreground">{fmt(m.internal_date)}</span>
            </div>
            <p className="mb-2 text-xs text-muted-foreground" dir="ltr">To: {m.to_addr}{m.cc_addr ? ` · Cc: ${m.cc_addr}` : ""}</p>
            {m.body_html ? (
              <MailMessageBody key={m.body_html} html={m.body_html} />
            ) : (
              <pre className="whitespace-pre-wrap break-words font-sans text-sm">{m.body_text || m.snippet}</pre>
            )}
            {atts.length > 0 && (              <div className="mt-2 flex flex-wrap gap-2">
                {atts.map((a: any) => (
                  <Button key={a.id} size="sm" variant="secondary" onClick={() => download(a)}><Paperclip className="ms-1 h-3 w-3" />{a.filename} <span className="text-xs opacity-70">({Math.ceil((a.size_bytes ?? 0) / 1024)}KB)</span></Button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {replyTo && isAdmin && (
        <MailComposer accounts={accounts} onDone={() => setReplyTo(null)}
          initial={{ accountId: replyTo.account_id, replyToId: replyTo.id, to: (replyTo.from_addr.match(/<([^>]+)>/)?.[1] ?? replyTo.from_addr), subject: /^re:/i.test(replyTo.subject ?? "") ? replyTo.subject : `Re: ${replyTo.subject ?? ""}` }} />
      )}
    </div>
  );
}

export function MailActivityLog() {
  const fn = useServerFn(listMailActivity);
  const q = useQuery({ queryKey: ["mail-activity"], queryFn: () => fn(), refetchInterval: livePoll(30000) });
  const AR: Record<string, string> = { read: "قرأ", marked_read: "علّم كمقروء", marked_unread: "علّم كغير مقروء", sent: "أرسل", replied: "رد", account_linked: "ربط حساب", account_relinked: "أعاد ربط حساب", account_unlinked: "حذف حساب", account_paused: "أوقف حساب", account_resumed: "شغّل حساب", star: "ميّز", unstar: "ألغى التمييز", archive: "أرشف", unarchive: "ألغى الأرشفة", trash: "نقل للمحذوفات", restore: "استعاد", delete: "حذف نهائي", add_label: "أضاف تصنيف", remove_label: "أزال تصنيف", label_created: "أنشأ تصنيف", label_deleted: "حذف تصنيف" };
  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border text-muted-foreground"><th className="p-2 text-start">الوقت</th><th className="p-2 text-start">المستخدم</th><th className="p-2 text-start">الإجراء</th><th className="p-2 text-start">تفاصيل</th></tr></thead>
        <tbody>
          {(q.data ?? []).map((r: any) => (
            <tr key={r.id} className="border-b border-border/50">
              <td className="p-2 whitespace-nowrap">{fmt(r.created_at)}</td><td className="p-2">{r.actor}</td><td className="p-2">{AR[r.action] ?? r.action}</td>
              <td className="p-2 text-xs text-muted-foreground" dir="ltr">{r.meta?.email ?? r.meta?.to ?? r.meta?.name ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
