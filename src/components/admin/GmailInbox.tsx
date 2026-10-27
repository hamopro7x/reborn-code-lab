import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Mail, Send, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listInbox, getMessage, replyMessage } from "@/lib/gmail.functions";

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.6);
  } catch {}
}

export function GmailInbox() {
  const listFn = useServerFn(listInbox);
  const getFn = useServerFn(getMessage);
  const replyFn = useServerFn(replyMessage);
  const q = useQuery({ queryKey: ["gmail-inbox"], queryFn: () => listFn(), refetchInterval: 20000 });
  const seen = useRef<Set<string> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    const ids = new Set(q.data.map((m) => m.id));
    if (seen.current) {
      const fresh = q.data.filter((m) => !seen.current!.has(m.id));
      if (fresh.length) {
        beep();
        toast.success(`رسالة جديدة: ${fresh[0].subject || fresh[0].from}`);
      }
    }
    seen.current = ids;
  }, [q.data]);

  const msg = useQuery({ queryKey: ["gmail-msg", openId], queryFn: () => getFn({ data: { id: openId! } }), enabled: !!openId });

  const send = async () => {
    if (!openId || !reply.trim()) return;
    setSending(true);
    try {
      await replyFn({ data: { id: openId, text: reply } });
      toast.success("تم إرسال الرد");
      setReply("");
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الإرسال");
    } finally {
      setSending(false);
    }
  };

  if (openId) {
    return (
      <div className="space-y-4 text-right" dir="rtl">
        <Button variant="ghost" onClick={() => { setOpenId(null); q.refetch(); }}>
          <ArrowRight className="h-4 w-4 ml-1" /> رجوع للبريد
        </Button>
        {msg.isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : msg.data ? (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="text-lg font-bold">{msg.data.subject || "(بدون عنوان)"}</h2>
            <p className="text-sm text-muted-foreground" dir="ltr">{msg.data.from}</p>
            <pre className="whitespace-pre-wrap text-sm font-sans" dir="auto">{msg.data.body}</pre>
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="اكتب الرد..." rows={4} dir="auto" />
            <Button onClick={send} disabled={sending || !reply.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 ml-1" />} إرسال الرد
            </Button>
          </div>
        ) : (
          <p className="text-destructive">تعذر فتح الرسالة</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-right" dir="rtl">
      <h1 className="text-xl font-bold flex items-center gap-2"><Mail className="h-5 w-5" /> البريد</h1>
      {q.isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
      {q.error && <p className="text-destructive">تعذر جلب الرسائل: {(q.error as Error).message}</p>}
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {(q.data ?? []).map((m) => (
          <button key={m.id} onClick={() => setOpenId(m.id)} className="w-full text-right p-3 hover:bg-muted/50 block">
            <div className="flex justify-between gap-2">
              <span className={m.unread ? "font-bold" : ""} dir="auto">{m.from.replace(/<.*>/, "").trim() || m.from}</span>
              <span className="text-xs text-muted-foreground shrink-0">{new Date(m.date).toLocaleString("ar-EG")}</span>
            </div>
            <div className={m.unread ? "font-semibold text-sm" : "text-sm"} dir="auto">{m.subject || "(بدون عنوان)"}</div>
            <div className="text-xs text-muted-foreground truncate" dir="auto">{m.snippet}</div>
          </button>
        ))}
        {q.data && q.data.length === 0 && <p className="p-4 text-muted-foreground">لا توجد رسائل</p>}
      </div>
    </div>
  );
}
