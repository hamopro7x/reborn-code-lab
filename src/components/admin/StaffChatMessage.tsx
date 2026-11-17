import { formatLocaleDateTime, formatTime } from "@/lib/format";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Check, CheckCheck, ChevronDown, Copy, Pencil, Trash2, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { StaffChatVoice } from "@/components/admin/StaffChatVoice";
import { StaffChatImageViewer } from "@/components/admin/StaffChatImageViewer";
import { getChatReceipts } from "@/lib/chat.functions";
import { canEditChatMessage, chatLinks, type ChatMessage, type ChatState } from "@/lib/chat-rules";
import { chatImageAttachments, viewerIndex } from "@/lib/chat-viewer";

export type ChatAction = (action: "edit" | "delete" | "hide" | "vote" | "ack" | "seen" | "state" | "send", payload: Record<string, unknown>) => Promise<void>;
export function StaffChatMessage({ message, state, act, forced = false }: {
  message: ChatMessage; state: ChatState; act: ChatAction; forced?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(message.body);
  const [choices, setChoices] = useState<number[]>([]);
  const [showReceipts, setShowReceipts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const receiptsFn = useServerFn(getChatReceipts);
  const receipts = useQuery({ queryKey: ["staff-chat-receipts", message.id], queryFn: () => receiptsFn({ data: { id: message.id } }), enabled: showReceipts });
  const run = async (action: Parameters<ChatAction>[0], payload: Record<string, unknown>) => {
    setBusy(true); try { await act(action, payload); } catch { /* The owning chat shows the failure; leave the message unchanged. */ } finally { setBusy(false); }
  };
  const poll = message.poll;
  const voted = message.votes?.some((vote) => vote.user_id === state.userId);
  const outgoing = message.sender_id === state.userId;
  const hasMedia = (message.attachments ?? []).some((attachment) => !!attachment.url && /^(image|video)\//.test(attachment.mime));
  const images = chatImageAttachments(message.attachments ?? []);
  const hasCaption = hasMedia && !!message.body.trim() && !message.deleted_at;
  const voiceOnly = !message.deleted_at && !message.body.trim() && message.attachments?.length === 1 && message.attachments[0]?.mime.startsWith("audio/");
  const messageText = editing ? <div className="my-2 flex gap-2"><Input value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} aria-label="تعديل الرسالة" />
    <Button disabled={busy} size="sm" onClick={() => void run("edit", { id: message.id, body }).then(() => setEditing(false))}>حفظ</Button>
    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>إلغاء</Button></div>
    : message.body.trim() && <p className={forced ? "mt-2 whitespace-pre-wrap break-words text-[15px] leading-8" : "staff-chat-message-text whitespace-pre-wrap break-words text-[15px]"}>{chatLinks(message.body).map((part, i) => part.url ?
      <a key={i} className="text-primary underline break-all" href={part.url} target="_blank" rel="noopener noreferrer">{part.text}</a> : <span key={i}>{part.text}</span>)}</p>;
  return <article id={`chat-message-${message.id}`} className={forced ? "py-4 min-w-0" : `staff-chat-bubble min-w-0${hasMedia ? " staff-chat-bubble-media" : ""}${hasCaption ? " staff-chat-bubble-caption" : ""}${voiceOnly ? " staff-chat-bubble-voice" : ""} ${message.sender_id === state.userId ? "staff-chat-outgoing" : "staff-chat-incoming"}`} dir="rtl">
    {(forced || !outgoing || message.mandatory) && <div className="flex flex-wrap items-center gap-2 text-sm">
      {(forced || !outgoing) &&
      <span className={forced ? "font-bold" : "staff-chat-sender font-bold text-[13px]"}>{message.sender_name}</span>
      }
      {message.mandatory && <span className="staff-chat-mandatory text-[13px] font-semibold">قراءة إجبارية</span>}
    </div>}
    {message.deleted_at ? <p className="mt-2 text-muted-foreground text-[15px]">تم حذف الرسالة لدى الجميع</p> : <>
      {!hasMedia && messageText}
      {message.mentions?.length > 0 && <div className="staff-chat-mention mt-2 flex flex-wrap gap-2 text-xs">{message.mentions.map((id) => <span key={id}>@{state.members.find((m) => m.id === id)?.name ?? "موظف"}</span>)}</div>}
      {(message.attachments ?? []).map((attachment) => {
        const media = !!attachment.url && /^(image|video)\//.test(attachment.mime);
        return <div className={media ? "staff-chat-media" : "mt-3 max-w-lg"} key={attachment.id}>
        {attachment.url && attachment.mime.startsWith("image/") && <button type="button" className="staff-chat-media-open" title="فتح الصورة" aria-label={`فتح ${attachment.name}`}
          onClick={() => setViewer(viewerIndex(images.findIndex((image) => image.id === attachment.id), images.length))}>
          <img className="max-h-96 max-w-full rounded-[10px] object-contain" src={attachment.url} alt={attachment.name} loading="lazy" />
        </button>}
        {attachment.url && attachment.mime.startsWith("video/") && <video className="max-h-96 max-w-full rounded-[10px]" controls preload="metadata" src={attachment.url} />}
        {attachment.url && attachment.mime.startsWith("audio/") && <StaffChatVoice src={attachment.url} sender={message.sender_name ?? ""} seed={attachment.id} />}
        {attachment.url && !/^(image|video|audio)\//.test(attachment.mime) && <a href={attachment.url} download={attachment.name} target="_blank" rel="noopener noreferrer" className="inline-flex gap-2 items-center text-xs text-primary break-all mt-1"><Download className="size-3 shrink-0" />{attachment.name} · {(attachment.size / 1024 / 1024).toFixed(2)} MB</a>}
      </div>;
      })}
      {hasMedia && <div className="staff-chat-media-caption">{messageText}</div>}
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
        {state.role === "admin" && <details className="text-xs"><summary className="cursor-pointer">أسماء المصوّتين</summary>{(message.votes ?? []).map((vote) => <p className="mt-2" key={vote.user_id}>{vote.name}: {vote.choices.map((i) => poll.options[i]).join("، ")} · {formatLocaleDateTime(vote.voted_at, "ar-EG")}</p>)}</details>}
      </section>}
      {message.edited_at && <p className="mt-2 text-xs text-muted-foreground">تم التعديل</p>}
      {!forced && <div className="staff-chat-message-actions">
        <DropdownMenu dir="rtl"><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-6" title="خيارات الرسالة" aria-label="خيارات الرسالة" disabled={busy}>{busy ? <Loader2 className="size-3 animate-spin" /> : <ChevronDown className="size-3.5" />}</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(message.body)}><Copy />نسخ</DropdownMenuItem>
            {canEditChatMessage(message.sender_id, state.userId, message.created_at, Date.now()) && <DropdownMenuItem onSelect={() => { setBody(message.body); setEditing(true); }}><Pencil />تعديل الرسالة</DropdownMenuItem>}
            {state.owner && <><DropdownMenuItem onSelect={() => void run("hide", { id: message.id })}><Trash2 />حذف لديّ</DropdownMenuItem><DropdownMenuItem className="text-destructive" onSelect={() => { if (window.confirm("حذف الرسالة لدى الجميع؟")) void run("delete", { id: message.id }); }}><Trash2 />حذف لدى الجميع</DropdownMenuItem></>}
            {state.role === "admin" && message.mandatory && <DropdownMenuItem onSelect={() => setShowReceipts(!showReceipts)}><CheckCheck />تأكيدات القراءة</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}
      {showReceipts && <div className="mt-2 text-xs space-y-2">{receipts.isLoading ? "جاري التحميل…" : receipts.isError ? "تعذر تحميل التأكيدات" : (receipts.data ?? []).map((receipt) => <p key={receipt.user_id}>{state.members.find((m) => m.id === receipt.user_id)?.name ?? "موظف"}: {receipt.read_at ? `تمت القراءة · ${formatLocaleDateTime(receipt.read_at, "ar-EG")}` : "لم يؤكد القراءة"}</p>)}</div>}
    </>}
    <span className={forced ? "mt-1 flex justify-end text-muted-foreground text-xs" : "staff-chat-message-meta text-muted-foreground"} dir="ltr">
      {!forced && outgoing && !message.deleted_at && <Check className="size-3" aria-label="تم الإرسال" />}
      <time dateTime={message.created_at} title={formatLocaleDateTime(message.created_at, "ar-EG")}>{forced ? formatLocaleDateTime(message.created_at, "ar-EG", { dateStyle: "short", timeStyle: "short" }) : formatTime(message.created_at)}</time>
    </span>
    {viewer !== null && viewer >= 0 && <StaffChatImageViewer images={images} index={viewer} caption={message.body} sender={outgoing ? "أنت" : message.sender_name} createdAt={message.created_at} onClose={() => setViewer(null)} />}
  </article>;
}