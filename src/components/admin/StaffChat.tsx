import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Paperclip, Mic, Square, X, BarChart3, AtSign, Loader2, Users, FileText, Images, Headphones } from "lucide-react";
import chatWallpaper from "@/assets/staff-chat-wallpaper.jpg";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { getChatState, getChatMessages, mutateChat, uploadChatFile } from "@/lib/chat.functions";
import { livePoll } from "@/lib/live-poll";
import { CHAT_MAX_BYTES, type ChatAttachment, type ChatMessage } from "@/lib/chat-rules";
import { StaffChatMessage, type ChatAction } from "./StaffChatMessage";

export function StaffChat({ targetId }: { targetId?: string }) {
  const qc = useQueryClient();
  const stateFn = useServerFn(getChatState); const readFn = useServerFn(getChatMessages);
  const mutate = useServerFn(mutateChat); const uploadFn = useServerFn(uploadChatFile);
  const stateQ = useQuery({ queryKey: ["staff-chat-state"], queryFn: () => stateFn(), refetchInterval: livePoll(5000) });
  const [before, setBefore] = useState<{ date: string; id: string }>();
  const messages = useQuery({ queryKey: ["staff-chat-messages", before, targetId], queryFn: () => readFn({ data: targetId ? { id: targetId } : { before: before?.date, beforeId: before?.id } }), enabled: stateQ.data?.enabled === true, refetchInterval: livePoll(5000) });
  const [text, setText] = useState(""); const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [mentions, setMentions] = useState<string[]>([]); const [everyone, setEveryone] = useState(false);
  const [mandatory, setMandatory] = useState(false); const [pollOpen, setPollOpen] = useState(false);
  const [mentionsOpen, setMentionsOpen] = useState(false);
  const [mandatoryMentions, setMandatoryMentions] = useState<string[]>([]);
  const [question, setQuestion] = useState(""); const [options, setOptions] = useState(["", ""]); const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false); const [recording, setRecording] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null); const recorder = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  const chooseFile = (accept: string) => {
    const input = fileInput.current;
    if (!input) return;
    input.accept = accept;
    input.click();
  };
  const state = stateQ.data;
  const canSend = state?.enabled && (state.open || state.role === "admin") && !state.pending.length;
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["staff-chat-messages"] }), qc.invalidateQueries({ queryKey: ["staff-chat-state"] }), qc.invalidateQueries({ queryKey: ["staff-chat-receipts"] })]); };
  const act: ChatAction = async (action, payload) => {
    try { await mutate({ data: { action, payload } }); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تنفيذ الطلب"); throw error; }
  };
  const upload = async (selected: File[]) => {
    if (selected.length + files.length > 10) { toast.error("الحد الأقصى 10 مرفقات للرسالة"); return; }
    setBusy(true);
    try {
      for (const file of selected) {
        if (file.size > CHAT_MAX_BYTES) throw new Error("الحد الأقصى 25 ميجابايت للمرفق");
        const form = new FormData(); form.set("file", file);
        const attachment = await uploadFn({ data: form }); setFiles((old) => [...old, attachment]);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "فشل رفع الملف"); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  };
  useEffect(() => { active.current = true; return () => { active.current = false; if (recorder.current) recorder.current.onstop = null; if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach((t) => t.stop()); }; }, []);
  useEffect(() => { if (!before && !targetId) end.current?.scrollIntoView({ block: "nearest" }); }, [messages.data?.length, before, targetId]);
  useEffect(() => { if (targetId && messages.data?.length) void mutate({ data: { action: "seen", payload: { id: targetId } } }).then(() => qc.invalidateQueries({ queryKey: ["staff-chat-state"] })).catch(() => {}); }, [targetId, messages.data?.length, mutate, qc]);
  const record = async () => {
    if (recording) { recorder.current?.stop(); setRecording(false); return; }
    try {
      if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") throw new Error("التسجيل غير متاح في المتصفح؛ تقدر ترفع ملف صوتي");
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.current = mic;
      const type = ["audio/webm", "audio/mp4", "audio/ogg"].find((mime) => MediaRecorder.isTypeSupported(mime));
      const rec = new MediaRecorder(mic, type ? { mimeType: type } : undefined); recorder.current = rec;
      const chunks: Blob[] = []; let total = 0;
      rec.ondataavailable = (event) => { chunks.push(event.data); total += event.data.size; if (total > CHAT_MAX_BYTES && rec.state === "recording") rec.stop(); };
      rec.onstop = () => { mic.getTracks().forEach((t) => t.stop()); setRecording(false); const mime = rec.mimeType.split(";")[0] ?? "audio/webm";
        const extension = mime === "audio/mp4" ? "m4a" : mime === "audio/ogg" ? "ogg" : "webm";
        if (active.current) void upload([new File(chunks, `تسجيل-${Date.now()}.${extension}`, { type: mime })]); };
      rec.start(1000); setRecording(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تشغيل الميكروفون"); }
  };
  const send = async () => {
    if (mandatory && !mandatoryMentions.length) { toast.error("اختار الموظفين المطلوب منهم القراءة الإجبارية"); return; }
    setBusy(true); try {
      await act("send", { body: text, mentions, everyone, mandatory, mandatoryMentions: mandatory ? mandatoryMentions : [], attachments: files.map((f) => f.id), poll: pollOpen ? { question, options, multiple } : null });
      setText(""); setFiles([]); setMentions([]); setEveryone(false); setMandatory(false); setMandatoryMentions([]); setPollOpen(false); setQuestion(""); setOptions(["", ""]); setBefore(undefined);
    } catch { /* error already shown; preserve draft */ } finally { setBusy(false); }
  };
  if (stateQ.isLoading) return <p className="p-4 text-muted-foreground">جاري تحميل الجروب…</p>;
  if (stateQ.isError) return <div className="space-y-3"><p className="text-destructive">تعذر تحميل الجروب</p><Button onClick={() => void stateQ.refetch()}>إعادة المحاولة</Button></div>;
  if (!state?.enabled) return <p className="text-muted-foreground">الجروب غير مفعّل لحد تطبيق ملف الإعدادات المعتمد.</p>;
  return <div dir="rtl" className="staff-chat min-w-0">
    <header className="staff-chat-header flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0"><span className="staff-chat-avatar flex size-10 shrink-0 items-center justify-center rounded-full"><Users className="size-5" /></span><div><h2 className="font-bold text-base">جروب MG Pro</h2><p className="text-xs text-muted-foreground mt-1">{state.members.length} أعضاء · {state.open ? "مفتوح" : "الأدمن فقط يقدر يرسل"}</p></div></div>
      {state.owner && <label className="flex gap-2 items-center text-sm"><span>مفتوح للإرسال</span><Switch checked={state.open} onCheckedChange={(open) => void act("state", { open }).catch(() => {})} /></label>}
    </header>
    <div className="staff-chat-transcript relative min-h-0 flex-1 overflow-y-auto px-4 py-5">
      <img src={chatWallpaper} alt="" aria-hidden="true" width={1024} height={1024} loading="lazy" className="staff-chat-wallpaper pointer-events-none absolute inset-0 h-full w-full object-cover" />
      <div className="relative min-h-full flex flex-col justify-end">
      {before && <Button variant="ghost" size="sm" onClick={() => setBefore(undefined)}>آخر الرسائل</Button>}
      {!targetId && (messages.data?.length ?? 0) === 50 && <Button variant="ghost" size="sm" onClick={() => { const first = messages.data?.[0]; if (first) setBefore({ date: first.created_at, id: first.id }); }}>رسائل أقدم</Button>}
      {messages.isLoading ? <p className="py-8 text-muted-foreground text-sm">جاري التحميل…</p> : messages.isError ? <div className="py-4"><p className="text-destructive">تعذر تحميل الرسائل</p><Button onClick={() => void messages.refetch()}>إعادة المحاولة</Button></div> : !messages.data?.length ? <p className="py-10 text-muted-foreground text-sm">مفيش رسائل هنا لسه</p> : messages.data.map((message: ChatMessage) => <StaffChatMessage key={message.id} message={message} state={state} act={act} />)}
      <div ref={end} />
      </div>
    </div>
    <section className="staff-chat-composer shrink-0 px-3 pt-2 pb-3 space-y-2">
      {!canSend ? <p className="text-sm text-muted-foreground">{state.pending.length ? "أكد قراءة الرسائل الإجبارية الأول" : "الجروب مغلق؛ تقدر تقرأ الرسائل الجديدة"}</p> : <>
        <div className="staff-chat-inputbar flex items-end gap-1 px-2 py-1.5">
          <input ref={fileInput} type="file" multiple className="hidden" aria-label="رفع مرفقات" onChange={(e) => void upload(Array.from(e.target.files ?? []))} />
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="shrink-0 rounded-full" title="المرفقات" aria-label="إرفاق ملف" disabled={busy || recording}><Paperclip className="size-5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" sideOffset={10} collisionPadding={12} className="staff-chat-attachment-menu w-56 max-w-[calc(100vw-24px)] p-1.5" aria-label="المرفقات">
              <DropdownMenuItem className="staff-chat-attachment-item" onSelect={() => chooseFile("")}><FileText className="staff-chat-document-icon" /><span>مستند</span></DropdownMenuItem>
              <DropdownMenuItem className="staff-chat-attachment-item" onSelect={() => chooseFile("image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime")}><Images className="staff-chat-media-icon" /><span>الصور ومقاطع الفيديو</span></DropdownMenuItem>
              <DropdownMenuItem className="staff-chat-attachment-item" onSelect={() => chooseFile("audio/webm,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/x-m4a")}><Headphones className="staff-chat-audio-icon" /><span>مقطع صوتي</span></DropdownMenuItem>
              <DropdownMenuItem className="staff-chat-attachment-item" onSelect={() => setPollOpen(!pollOpen)}><BarChart3 className="staff-chat-poll-icon" /><span>استطلاع رأي</span></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="staff-chat-attachment-item" onSelect={(event) => { event.preventDefault(); setMentionsOpen(!mentionsOpen); }}><AtSign className="staff-chat-media-icon" /><span>منشن {everyone ? "الجميع" : mentions.length || ""}</span></DropdownMenuItem>
              {mentionsOpen && <>
                {state.role === "admin" && <DropdownMenuCheckboxItem checked={everyone} onCheckedChange={setEveryone} onSelect={(event) => event.preventDefault()}>الجميع</DropdownMenuCheckboxItem>}
                {state.members.filter((m) => m.role === "employee").map((member) => <DropdownMenuCheckboxItem key={member.id} checked={mentions.includes(member.id)} disabled={everyone} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => setMentions((old) => checked ? [...old, member.id] : old.filter((id) => id !== member.id))}>@{member.name}</DropdownMenuCheckboxItem>)}
              </>}
              {state.role === "admin" && <>
                <DropdownMenuCheckboxItem className="min-h-10" checked={mandatory} disabled={!state.targetedMandatory} onCheckedChange={setMandatory} onSelect={(event) => event.preventDefault()}>قراءة إجبارية</DropdownMenuCheckboxItem>
                {mandatory && <>
                  <DropdownMenuLabel className="text-xs">منشن القراءة الإجبارية</DropdownMenuLabel>
                  {state.members.filter((m) => m.role === "employee").map((member) => <DropdownMenuCheckboxItem key={member.id} checked={mandatoryMentions.includes(member.id)} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => setMandatoryMentions((old) => checked ? [...old, member.id] : old.filter((id) => id !== member.id))}>@{member.name}</DropdownMenuCheckboxItem>)}
                </>}
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب رسالة…" aria-label="نص الرسالة" maxLength={10000} className="staff-chat-textarea min-w-0 flex-1" />
          <Button size="icon" variant={recording ? "destructive" : "ghost"} className="shrink-0" title={recording ? "إيقاف التسجيل" : "تسجيل صوتي"} aria-label={recording ? "إيقاف التسجيل" : "تسجيل صوتي"} disabled={busy} onClick={() => void record()}>{recording ? <Square className="size-4" /> : <Mic className="size-5" />}</Button>
          <Button size="icon" className="staff-chat-send shrink-0" title="إرسال" aria-label="إرسال" disabled={busy || recording || (!text.trim() && !files.length && !pollOpen)} onClick={() => void send()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button>
        </div>
        {files.length>0 && <div className="flex flex-wrap gap-2">{files.map((file) => <div key={file.id} className="flex gap-1 items-center bg-muted px-2 py-1 rounded text-xs max-w-full"><span className="truncate">{file.name}</span><Button size="icon" variant="ghost" className="size-6 shrink-0" aria-label={`إزالة ${file.name}`} onClick={() => setFiles((old) => old.filter((f) => f.id !== file.id))}><X className="size-3" /></Button></div>)}</div>}
        {pollOpen && <div className="border-s-2 border-primary ps-3 space-y-2"><Input placeholder="سؤال الاستطلاع" aria-label="سؤال الاستطلاع" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} />
          {options.map((option, index) => <div key={index} className="flex gap-1"><Input value={option} maxLength={200} placeholder={`اختيار ${index + 1}`} aria-label={`اختيار ${index + 1}`} onChange={(e) => setOptions((old) => old.map((v, i) => i === index ? e.target.value : v))} />{options.length>2 && <Button variant="ghost" size="icon" aria-label={`إزالة اختيار ${index+1}`} onClick={() => setOptions((old) => old.filter((_, i) => i !== index))}><X className="size-4" /></Button>}</div>)}
          <div className="flex flex-wrap gap-3 items-center"><Button size="sm" variant="outline" disabled={options.length>=20} onClick={() => setOptions((old) => [...old, ""])}>إضافة اختيار</Button><label className="text-xs flex gap-2"><input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />السماح بعدة اختيارات</label></div></div>}
      </>}
    </section>
  </div>;
}