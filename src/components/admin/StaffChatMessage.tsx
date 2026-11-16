import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Check, CheckCheck, ChevronDown, Copy, Pencil, Trash2, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { getChatReceipts } from "@/lib/chat.functions";
import { canEditChatMessage, chatLinks, type ChatMessage, type ChatState } from "@/lib/chat-rules";

export type ChatAction = (action: "edit" | "delete" | "hide" | "vote" | "ack" | "seen" | "state" | "send", payload: Record<string, unknown>) => Promise<void>;
export function StaffChatMessage({ message, state, act, forced = false }: {
  message: ChatMessage; state: ChatState; act: ChatAction; forced?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(message.body);
  const [choices, setChoices] = useState<number[]>([]);
  const [showReceipts, setShowReceipts] = useState(false);
  const [busy, setBusy] = useState(false);
  const receiptsFn = useServerFn(getChatReceipts);
  const receipts = useQuery({ queryKey: ["staff-chat-receipts", message.id], queryFn: () => receiptsFn({ data: { id: message.id } }), enabled: showReceipts });
  const run = async (action: Parameters<ChatAction>[0], payload: Record<string, unknown>) => {
    setBusy(true); try { await act(action, payload); } catch { /* The owning chat shows the failure; leave the message unchanged. */ } finally { setBusy(false); }
  };
  const poll = message.poll;
  const voted = message.votes?.some((vote) => vote.user_id === state.userId);
  const outgoing = message.sender_id === state.userId;
  return <article id={`chat-message-${message.id}`} className={forced ? "py-4 min-w-0" : `staff-chat-bubble min-w-0 ${message.sender_id === state.userId ? "staff-chat-outgoing" : "staff-chat-incoming"}`} dir="rtl">
    {(forced || !outgoing || message.mandatory) && <div className="flex flex-wrap items-center gap-2 text-sm">
      {(forced || !outgoing) &&
      <span className={forced ? "font-bold" : "staff-chat-sender font-bold text-xs"}>{message.sender_name}</span>
      }
      {message.mandatory && <span className="text-destructive text-xs font-semibold">قراءة إجبارية</span>}
    </div>}
    {message.deleted_at ? <p className="mt-2 text-muted-foreground text-sm">تم حذف الرسالة لدى الجميع</p> : <>
      {editing ? <div className="my-2 flex gap-2"><Input value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} aria-label="تعديل الرسالة" />
        <Button disabled={busy} size="sm" onClick={() => void run("edit", { id: message.id, body }).then(() => setEditing(false))}>حفظ</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>إلغاء</Button></div>
        : <p className={forced ? "mt-2 whitespace-pre-wrap break-words text-sm leading-7" : "staff-chat-message-text whitespace-pre-wrap break-words text-sm"}>{chatLinks(message.body).map((part, i) => part.url ?
          <a key={i} className="text-primary underline break-all" href={part.url} target="_blank" rel="noopener noreferrer">{part.text}</a> : <span key={i}>{part.text}</span>)}</p>}
      {message.mentions?.length > 0 && <div className="mt-2 flex flex-wrap gap-2 text-xs text-primary">{message.mentions.map((id) => <span key={id}>@{state.members.find((m) => m.id === id)?.name ?? "موظف"}</span>)}</div>}
      {!!message.mandatory_mentions?.length && <div className="mt-2 flex flex-wrap gap-2 text-xs text-destructive"><span>قراءة مطلوبة:</span>{message.mandatory_mentions.map((id) => <span key={id}>@{state.members.find((m) => m.id === id)?.name ?? "موظف"}</span>)}</div>}
      {(message.attachments ?? []).map((attachment) => <div className="mt-3 max-w-lg" key={attachment.id}>
        {attachment.url && attachment.mime.startsWith("image/") && <a href={attachment.url} target="_blank" rel="noopener noreferrer"><img className="max-h-80 max-w-full rounded-md object-contain" src={attachment.url} alt={attachment.name} loading="lazy" /></a>}
        {attachment.url && attachment.mime.startsWith("video/") && <video className="max-h-80 w-full rounded-md" controls preload="metadata" src={attachment.url} />}
        {attachment.url && attachment.mime.startsWith("audio/") && <audio className="w-full" controls preload="metadata" src={attachment.url} />}
        <a href={attachment.url} download={attachment.name} target="_blank" rel="noopener noreferrer" className="inline-flex gap-2 items-center text-xs text-primary break-all mt-1"><Download className="size-3 shrink-0" />{attachment.name} · {(attachment.size / 1024 / 1024).toFixed(2)} MB</a>
      </div>)}
      {poll && <section className="my-3 border-s-2 border-primary ps-3 space-y-2">
        <h3 className="font-semibold text-sm">{poll.question}</h3>
        {poll.options.map((option, index) => {
          const count = (message.votes ?? []).filter((v) => v.choices.includes(index)).length;
          const total = (message.votes ?? []).length;
          return <label key={index} className="flex items-center flex-wrap gap-2 text-sm">
            <input type={poll.multiple ? "checkbox" : "radio"} name={`poll-${message.id}`} disabled={voted || forced || busy} checked={voted ? message.votes.find((v) => v.user_id === state.userId)?.choices.includes(index) : choices.includes(index)}
              onChange={() => setChoices((old) => poll.multiple ? old.includes(index) ? old.filter((i) => i !== index) : [...old, index] : [index])} />
            <span className="break-words">{option}</span><span className="text-muted-foreground text-xs">{count} · {total ? Math.round(count / total * 100) : 0}%</span>
          </label>;
        })}
        <div className="flex items-center gap-3 text-xs text-muted-foreground"><span>{message.votes?.length ?? 0} مشارك</span>
          {!voted && !forced && <Button size="sm" disabled={!choices.length || busy} onClick={() => void run("vote", { id: message.id, choices })}>تصويت</Button>}</div>
        {state.role === "admin" && <details className="text-xs"><summary className="cursor-pointer">أسماء المصوّتين</summary>{(message.votes ?? []).map((vote) => <p className="mt-2" key={vote.user_id}>{vote.name}: {vote.choices.map((i) => poll.options[i]).join("، ")} · {new Date(vote.voted_at).toLocaleString("ar-EG")}</p>)}</details>}
      </section>}
      {message.edited_at && <p className="mt-2 text-xs text-muted-foreground">تم التعديل</p>}
      {!forced && <div className="staff-chat-message-actions">
        <DropdownMenu dir="rtl"><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-6" title="خيارات الرسالة" aria-label="خيارات الرسالة" disabled={busy}>{busy ? <Loader2 className="size-3 animate-spin" /> : <ChevronDown className="size-3.5" />}</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(message.body)}><Copy />نسخ الرسالة والروابط</DropdownMenuItem>
            {canEditChatMessage(message.sender_id, state.userId, message.created_at, Date.now()) && <DropdownMenuItem onSelect={() => { setBody(message.body); setEditing(true); }}><Pencil />تعديل الرسالة</DropdownMenuItem>}
            {state.owner && <><DropdownMenuItem onSelect={() => void run("hide", { id: message.id })}><Trash2 />إخفاء لديّ فقط</DropdownMenuItem><DropdownMenuItem className="text-destructive" onSelect={() => { if (window.confirm("حذف الرسالة لدى الجميع؟")) void run("delete", { id: message.id }); }}><Trash2 />حذف لدى الجميع</DropdownMenuItem></>}
            {state.role === "admin" && message.mandatory && <DropdownMenuItem onSelect={() => setShowReceipts(!showReceipts)}><CheckCheck />تأكيدات القراءة</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}
      {showReceipts && <div className="mt-2 text-xs space-y-2">{receipts.isLoading ? "جاري التحميل…" : receipts.isError ? "تعذر تحميل التأكيدات" : (receipts.data ?? []).map((receipt) => <p key={receipt.user_id}>{state.members.find((m) => m.id === receipt.user_id)?.name ?? "موظف"}: {receipt.read_at ? `تمت القراءة · ${new Date(receipt.read_at).toLocaleString("ar-EG")}` : "لم يؤكد القراءة"}</p>)}</div>}
    </>}
    <span className={forced ? "mt-1 flex justify-end text-muted-foreground text-xs" : "staff-chat-message-meta text-muted-foreground"} dir="ltr">
      {!forced && outgoing && !message.deleted_at && <Check className="size-3" aria-label="تم الإرسال" />}
      <time dateTime={message.created_at} title={new Date(message.created_at).toLocaleString("ar-EG")}>{new Date(message.created_at).toLocaleString(forced ? "ar-EG" : "en-GB", forced ? { dateStyle: "short", timeStyle: "short" } : { hour: "2-digit", minute: "2-digit" })}</time>
    </span>
  </article>;
}