import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ChatAttachment } from "@/lib/chat-rules";

type MediaItem = { file: File; url: string; attachment?: ChatAttachment };
export function StaffChatMediaPreview({ selected, caption, onCaption, onClose, onAdd, onUpload, onSend, maxFiles = 10 }: {
  selected: File[]; caption: string; onCaption: (value: string) => void; onClose: () => void;
  onAdd: () => void; onUpload: (file: File) => Promise<ChatAttachment>;
  onSend: (attachments: ChatAttachment[], caption: string) => Promise<boolean>;
  maxFiles?: number;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const urls = useRef<string[]>([]);
  useEffect(() => {
    const added = selected.map((file) => ({ file, url: URL.createObjectURL(file) }));
    urls.current.push(...added.map((item) => item.url));
    setItems((old) => {
      if (old.length + added.length > maxFiles) {
        setError("الحد الأقصى 10 مرفقات للرسالة");
        return old;
      }
      return [...old, ...added];
    });
  }, [selected]);
  useEffect(() => () => { urls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  const item = items[Math.min(current, items.length - 1)];
  const send = async () => {
    if (sending.current || !items.length || items.length > maxFiles) return;
    sending.current = true; setBusy(true); setError("");
    try {
      const attachments: ChatAttachment[] = [];
      for (const media of items) {
        const attachment = media.attachment ?? await onUpload(media.file);
        media.attachment = attachment;
        attachments.push(attachment);
      }
      if (await onSend(attachments, caption)) onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر إرسال الملفات، حاول تاني"); }
    finally { sending.current = false; setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="flex h-[100dvh] w-full max-w-none flex-col gap-0 rounded-none border-0 p-0 sm:rounded-none [&>button]:hidden" aria-describedby={undefined} dir="rtl" onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }} onInteractOutside={(e) => e.preventDefault()}>
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <DialogTitle className="text-sm">{item?.file.type.startsWith("video/") ? "إرسال فيديو" : "إرسال صورة"}</DialogTitle>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" aria-label="حذف الملف المحدد" title="حذف الملف المحدد" disabled={busy || !item} onClick={() => {
            const next = items.filter((media) => media !== item);
            if (!next.length) onClose(); else { setItems(next); setCurrent(Math.max(0, current - 1)); }
          }}><Trash2 className="size-5" /></Button>
          <Button variant="ghost" size="icon" aria-label="إلغاء إرسال الملفات" title="إلغاء" disabled={busy} onClick={onClose}><X className="size-5" /></Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        {item && (item.file.type.startsWith("video/") ? <video key={item.url} src={item.url} controls className="h-full max-h-full w-full object-contain" /> : <img src={item.url} alt="معاينة الصورة" className="h-full max-h-full w-full object-contain" />)}
      </div>
      <footer className="shrink-0 space-y-3 border-t border-border bg-card px-4 py-3">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Textarea value={caption} onChange={(e) => onCaption(e.target.value)} disabled={busy} maxLength={10000} aria-label="تعليق على الصورة أو الفيديو" placeholder="اكتب تعليقًا…" className="mx-auto min-h-10 max-w-2xl resize-none" rows={1} />
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-x-auto">
            {items.map((media, index) => <Button key={media.url} variant="outline" className={`size-14 shrink-0 overflow-hidden p-1 ${item === media ? "border-primary ring-1 ring-primary" : ""}`} disabled={busy} aria-label={`معاينة الملف ${index + 1}`} onClick={() => setCurrent(index)}>
              {media.file.type.startsWith("video/") ? <video src={media.url} muted preload="metadata" className="size-full object-cover" /> : <img src={media.url} alt="" className="size-full object-cover" />}
            </Button>)}
            <Button variant="outline" size="icon" className="shrink-0" disabled={busy} aria-label="إضافة صور أو فيديوهات" title="إضافة صور أو فيديوهات" onClick={onAdd}><Plus className="size-5" /></Button>
          </div>
          <Button size="icon" className="staff-chat-send size-12 shrink-0" aria-label="إرسال الصور والفيديوهات" title="إرسال" disabled={busy || !items.length} onClick={() => void send()}>{busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}</Button>
        </div>
      </footer>
    </DialogContent>
  </Dialog>;
}