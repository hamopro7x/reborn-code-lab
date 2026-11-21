import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { sendMail, saveMailDraft } from "@/lib/mail.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Paperclip, Send, X } from "lucide-react";

export function MailComposer({ accounts, initial, onDone }: { accounts: any[]; initial: any; onDone: () => void }) {
  const sendFn = useServerFn(sendMail);
  const draftFn = useServerFn(saveMailDraft);
  const qc = useQueryClient();
  const [f, setF] = useState({ accountId: initial.accountId ?? accounts[0]?.id ?? "", to: initial.to ?? "", cc: initial.cc ?? "", subject: initial.subject ?? "", body: initial.body ?? "" });
  const [draftId, setDraftId] = useState<string | undefined>(initial.draftId);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  const send = async () => {
    setBusy(true);
    try {
      const attachments = await Promise.all(files.map(async (file) => {
        const buf = new Uint8Array(await file.arrayBuffer());
        let s = "";
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return { filename: file.name, mimeType: file.type || "application/octet-stream", base64: btoa(s) };
      }));
      await sendFn({ data: { ...f, replyToId: initial.replyToId, draftId, attachments } });
      toast.success("تم الإرسال");
      qc.invalidateQueries({ queryKey: ["mail-msgs"] });
      qc.invalidateQueries({ queryKey: ["mail-drafts"] });
      onDone();
    } catch (e: any) { toast.error(e?.message ?? "فشل الإرسال"); }
    finally { setBusy(false); }
  };
  const saveDraft = async () => {
    try {
      const r = await draftFn({ data: { ...f, id: draftId, replyToId: initial.replyToId } });
      setDraftId(r.id ?? undefined);
      toast.success("تم حفظ المسودة");
      qc.invalidateQueries({ queryKey: ["mail-drafts"] });
    } catch (e: any) { toast.error(e?.message ?? "تعذر الحفظ"); }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between"><b>{initial.replyToId ? "رد" : "رسالة جديدة"}</b><Button size="icon" variant="ghost" onClick={onDone}><X className="h-4 w-4" /></Button></div>
      <select className="w-full rounded-md border border-input bg-background p-2 text-sm" value={f.accountId} onChange={set("accountId")} disabled={!!initial.replyToId}>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
      </select>
      <Input dir="ltr" placeholder="إلى" value={f.to} onChange={set("to")} />
      <Input dir="ltr" placeholder="نسخة (Cc)" value={f.cc} onChange={set("cc")} />
      <Input placeholder="الموضوع" value={f.subject} onChange={set("subject")} />
      <Textarea rows={8} placeholder="نص الرسالة" value={f.body} onChange={set("body")} />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <Paperclip className="h-4 w-4" />إرفاق ملفات {files.length > 0 && `(${files.length})`}
        <input type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      </label>
      <div className="flex gap-2">
        <Button onClick={send} disabled={busy || !f.to || !f.accountId}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="ms-1 h-4 w-4" />}إرسال</Button>
        <Button variant="outline" onClick={saveDraft}>حفظ كمسودة</Button>      </div>
    </div>
  );
}
