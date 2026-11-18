import { Fragment, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Paperclip, Mic, Pause, Play, Trash2, X, BarChart3, AtSign, Loader2, Users, FileText, Images, Headphones } from "lucide-react";
import chatWallpaper from "@/assets/staff-chat-original-wallpaper.png.asset.json";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { getChatState, getChatMessages, mutateChat, uploadChatFile } from "@/lib/chat.functions";
import { livePoll } from "@/lib/live-poll";
import { chatReadPhase, chatRetryDelay } from "@/lib/chat-query";
import { parseChatReadCursor, unreadChatMessages, type ChatReadCursor } from "@/lib/chat-unread";
import { sendChatRecording } from "@/lib/chat-recording";
import { allChatEmployeeIds, CHAT_MAX_BYTES, type ChatAttachment, type ChatMessage } from "@/lib/chat-rules";
import { StaffChatMessage, type ChatAction } from "./StaffChatMessage";
import { StaffChatMediaPreview } from "./StaffChatMediaPreview";
import { StaffChatVoice } from "./StaffChatVoice";

export function StaffChat({ targetId }: { targetId?: string }) {
  const qc = useQueryClient();
  const stateFn = useServerFn(getChatState); const readFn = useServerFn(getChatMessages);
  const mutate = useServerFn(mutateChat); const uploadFn = useServerFn(uploadChatFile);
  const stateQ = useQuery({ queryKey: ["staff-chat-state"], queryFn: () => stateFn(), refetchOnMount: "always", refetchInterval: livePoll(5000), retry: 3, retryDelay: chatRetryDelay });
  const [before, setBefore] = useState<{ date: string; id: string }>();
  const messages = useQuery({ queryKey: ["staff-chat-messages", before], queryFn: () => readFn({ data: { before: before?.date, beforeId: before?.id } }), enabled: stateQ.data?.enabled !== false, staleTime: 0, refetchOnMount: "always", refetchInterval: livePoll(2000), retry: 3, retryDelay: chatRetryDelay });
  const messagesPhase = chatReadPhase(messages.data, messages.isError);
  const [text, setText] = useState(""); const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [mediaSelection, setMediaSelection] = useState<File[]>([]);
  const [mediaOpen, setMediaOpen] = useState(false);
  const mediaInput = useRef<HTMLInputElement>(null);
  const [mentions, setMentions] = useState<string[]>([]); const [everyone, setEveryone] = useState(false);
  const [mandatory, setMandatory] = useState(false); const [pollOpen, setPollOpen] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [mentionsOpen, setMentionsOpen] = useState(false);
  const [mandatoryOpen, setMandatoryOpen] = useState(false);
  const [mandatoryMentions, setMandatoryMentions] = useState<string[]>([]);
  const [namesOffset, setNamesOffset] = useState(0);
  const [namesMaxHeight, setNamesMaxHeight] = useState(420);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);
  const mentionTriggerRef = useRef<HTMLDivElement>(null);
  const mandatoryTriggerRef = useRef<HTMLDivElement>(null);
  // keeps the names card level with the attachments card: same bottom line, never above the screen
  const alignNamesCard = (trigger: HTMLElement | null) => {
    const menu = attachmentMenuRef.current;
    if (!trigger || !menu) return;
    const menuBottom = menu.getBoundingClientRect().bottom;
    setNamesOffset(Math.round(trigger.getBoundingClientRect().bottom - menuBottom));
    setNamesMaxHeight(Math.max(160, Math.min(420, Math.round(menuBottom - 12))));
  };
  const [question, setQuestion] = useState(""); const [options, setOptions] = useState(["", ""]); const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false); const [recording, setRecording] = useState(false); const [paused, setPaused] = useState(false); const [seconds, setSeconds] = useState(0); const discard = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null); const recorder = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const [readBaseline, setReadBaseline] = useState<{ userId: string; cursor: ChatReadCursor | null } | null>(null);
  const initialScroll = useRef(false);
  const active = useRef(true);
  const sendOnStop = useRef(false);
  const [pendingTexts, setPendingTexts] = useState<{ id: string; body: string }[]>([]);
  const [pendingVoices, setPendingVoices] = useState<{ id: string; url: string }[]>([]);
  const recordingSend = useRef<(file: File) => Promise<void>>(async () => {});
  const chooseFile = (accept: string) => {
    const input = fileInput.current;
    if (!input) return;
    input.accept = accept;
    input.click();
  };
  const state = stateQ.data;
  const unread = !before && readBaseline && readBaseline.userId === state?.userId
    ? unreadChatMessages(messages.data ?? [], readBaseline.userId, readBaseline.cursor) : [];
  useEffect(() => {
    if (!state?.userId) return;
    let cursor: ChatReadCursor | null = null;
    try { cursor = parseChatReadCursor(localStorage.getItem(`staff-chat-read:${state.userId}`)); } catch { /* Device storage may be unavailable. */ }
    setReadBaseline({ userId: state.userId, cursor });
    initialScroll.current = false;
  }, [state?.userId]);
  useEffect(() => {
    if (!state?.userId || !messages.data?.length || before || !readBaseline) return;
    const marker = end.current;
    if (!marker) return;
    const save = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      const bounds = marker.getBoundingClientRect();
      const container = marker.closest(".staff-chat-transcript")?.getBoundingClientRect();
      if (!container || bounds.top > container.bottom || bounds.bottom < container.top) return;
      const latest = messages.data?.at(-1);
      if (!latest) return;
      const cursor = { date: latest.created_at, id: latest.id };
      try { localStorage.setItem(`staff-chat-read:${state.userId}`, JSON.stringify(cursor)); } catch { /* Keep chat usable without storage. */ }
      if (!readBaseline.cursor) setReadBaseline({ userId: state.userId, cursor });
    };
    const observer = new IntersectionObserver(save, { root: marker.closest(".staff-chat-transcript") });
    observer.observe(marker);
    window.addEventListener("focus", save);
    document.addEventListener("visibilitychange", save);
    return () => { observer.disconnect(); window.removeEventListener("focus", save); document.removeEventListener("visibilitychange", save); };
  }, [state?.userId, messages.data, before, targetId, readBaseline]);
  const canSend = state?.enabled && (state.open || state.role === "admin") && !state.pending.length;
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["staff-chat-messages"] }), qc.invalidateQueries({ queryKey: ["staff-chat-state"] }), qc.invalidateQueries({ queryKey: ["staff-chat-receipts"] })]); };
  const withAuthRetry = async <T,>(run: () => Promise<T>): Promise<T> => {
    try { return await run(); }
    catch (error) {
      if (!(error instanceof Error) || !/unauthorized|authorization/i.test(error.message)) throw error;
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.refreshSession();
      if (!data.session) throw new Error("انتهت الجلسة، سجّل الدخول من جديد");
      return await run();
    }
  };
  const act: ChatAction = async (action, payload) => {
    try { await withAuthRetry(() => mutate({ data: { action, payload } })); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تنفيذ الطلب"); throw error; }
  };
  const upload = async (selected: File[]) => {
    if (selected.length + files.length > 10) { toast.error("الحد الأقصى 10 مرفقات للرسالة"); return; }
    setBusy(true);
    try {
      for (const file of selected) {
        if (file.size > CHAT_MAX_BYTES) throw new Error("الحد الأقصى 25 ميجابايت للمرفق");
        const form = new FormData(); form.set("file", file);
        const attachment = await withAuthRetry(() => uploadFn({ data: form })); setFiles((old) => [...old, attachment]);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "فشل رفع الملف"); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  };
  useEffect(() => { active.current = true; return () => { active.current = false; if (recorder.current) recorder.current.onstop = null; if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach((t) => t.stop()); }; }, []);
  useEffect(() => {
    if (before || !readBaseline || !messages.data?.length) return;
    if (!initialScroll.current) {
      const first = unread[0];
      const target = first ? document.getElementById(`chat-message-${first.id}`) : null;
      if (target) {
        target.scrollIntoView({ block: "start" });
        const transcript = target.closest(".staff-chat-transcript");
        if (transcript) transcript.scrollTop -= 52;
      } else end.current?.scrollIntoView({ block: "nearest" });
      initialScroll.current = true;
    } else if (!unread.length) end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.data?.length, before, targetId, readBaseline, unread.length]);
  // Mandatory/mention links show the full group and jump to the target message.
  const targetScrolled = useRef<string | null>(null);
  useEffect(() => {
    if (!targetId || before || !messages.data?.length || unread.length || targetScrolled.current === targetId) return;
    const el = document.getElementById(`chat-message-${targetId}`);
    if (el) { el.scrollIntoView({ block: "center" }); targetScrolled.current = targetId; }
  }, [targetId, before, messages.data, unread.length]);
  useEffect(() => { if (targetId && messages.data?.length) void mutate({ data: { action: "seen", payload: { id: targetId } } }).then(() => qc.invalidateQueries({ queryKey: ["staff-chat-state"] })).catch(() => {}); }, [targetId, messages.data?.length, mutate, qc]);
  useEffect(() => { if (!recording || paused) return; const t = window.setInterval(() => setSeconds((v) => v + 1), 1000); return () => window.clearInterval(t); }, [recording, paused]);
  const togglePause = () => { const rec = recorder.current; if (!rec) return; if (rec.state === "recording") { rec.pause(); setPaused(true); } else if (rec.state === "paused") { rec.resume(); setPaused(false); } };
  const cancelRecording = () => { discard.current = true; if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop(); setRecording(false); setPaused(false); };
  const record = async () => {
    if (recording) {
      if (busy || (mandatory && !mandatoryMentions.length)) {
        if (mandatory && !mandatoryMentions.length) toast.error("اختار الموظفين المطلوب منهم القراءة الإجبارية");
        return;
      }
      const rec = recorder.current;
      if (!rec || rec.state === "inactive") return;
      sendOnStop.current = true; rec.stop(); setRecording(false); setPaused(false); return;
    }
    try {
      if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") throw new Error("التسجيل غير متاح في المتصفح؛ تقدر ترفع ملف صوتي");
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.current = mic;
      const type = ["audio/webm", "audio/mp4", "audio/ogg"].find((mime) => MediaRecorder.isTypeSupported(mime));
      const rec = new MediaRecorder(mic, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 }); recorder.current = rec;
      const chunks: Blob[] = []; let total = 0;
      rec.ondataavailable = (event) => { chunks.push(event.data); total += event.data.size; if (total > CHAT_MAX_BYTES && rec.state !== "inactive") rec.stop(); };
      rec.onstop = () => { mic.getTracks().forEach((t) => t.stop()); setRecording(false); const mime = rec.mimeType.split(";")[0] ?? "audio/webm";
        const extension = mime === "audio/mp4" ? "m4a" : mime === "audio/ogg" ? "ogg" : "webm";
        if (active.current && !discard.current) {
          const file = new File(chunks, `تسجيل-${Date.now()}.${extension}`, { type: mime });
          if (sendOnStop.current) void recordingSend.current(file);
          else void upload([file]);
        } };
      discard.current = false; sendOnStop.current = false; setSeconds(0); setPaused(false); rec.start(1000); setRecording(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تشغيل الميكروفون"); }
  };
  const send = async (attachments = files, body = text) => {
    if (mandatory && !mandatoryMentions.length) { toast.error("اختار الموظفين المطلوب منهم القراءة الإجبارية"); return false; }
    const optimistic = body.trim() && !pollOpen ? { id: `text-${Date.now()}`, body } : null;
    if (optimistic) { setPendingTexts((old) => [...old, optimistic]); setText(""); requestAnimationFrame(() => end.current?.scrollIntoView({ block: "nearest" })); }
    setBusy(true); try {
      await act("send", { body, mentions, everyone, mandatory, mandatoryMentions: mandatory ? mandatoryMentions : [], attachments: attachments.map((f) => f.id), poll: pollOpen ? { question, options, multiple } : null });
      setText(""); setFiles([]); setMentions([]); setEveryone(false); setMandatory(false); setMandatoryMentions([]); setPollOpen(false); setQuestion(""); setOptions(["", ""]); setBefore(undefined);
      return true;
    } catch { if (optimistic) setText((current) => current || body); return false; /* error already shown; preserve draft */ }
    finally { setBusy(false); if (optimistic) setPendingTexts((old) => old.filter((item) => item.id !== optimistic.id)); }
  };
  recordingSend.current = async (file) => {
    const pendingId = `voice-${Date.now()}`; const url = URL.createObjectURL(file);
    setPendingVoices((old) => [...old, { id: pendingId, url }]);
    requestAnimationFrame(() => end.current?.scrollIntoView({ block: "nearest" }));
    try {
      if (files.length >= 10) throw new Error("الحد الأقصى 10 مرفقات للرسالة");
      if (!file.size || file.size > CHAT_MAX_BYTES) throw new Error("التسجيل فارغ أو حجمه أكبر من 25 ميجابايت");
      await sendChatRecording(file, async (voice) => {
        const form = new FormData(); form.set("file", voice);
        return withAuthRetry(() => uploadFn({ data: form }));
      }, (attachment) => send([...files, attachment]), (attachment) => setFiles((old) => [...old, attachment]));
    } catch (error) { toast.error(error instanceof Error ? error.message : "فشل إرسال التسجيل"); }
    finally { setBusy(false); setPendingVoices((old) => old.filter((v) => v.id !== pendingId)); URL.revokeObjectURL(url); }
  };
  if (stateQ.isLoading) return null;
  if (stateQ.isError && !state) return <div className="space-y-3"><p className="text-muted-foreground">جاري إعادة الاتصال بالجروب…</p><Button onClick={() => void stateQ.refetch()}>إعادة المحاولة</Button></div>;
  if (!state?.enabled) return <p className="text-muted-foreground">الجروب غير مفعّل لحد تطبيق ملف الإعدادات المعتمد.</p>;
  return <div dir="rtl" className="staff-chat min-w-0">
    <input ref={mediaInput} type="file" multiple className="hidden" aria-label="اختيار صور وفيديوهات" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime" onChange={(e) => {
      const selected = Array.from(e.target.files ?? []); e.target.value = "";
      if (!selected.length) return;
      if (selected.some((file) => !file.size || file.size > CHAT_MAX_BYTES)) { toast.error("الحد الأقصى 25 ميجابايت للمرفق"); return; }
      setMediaSelection(selected); setMediaOpen(true);
    }} />
    {mediaOpen && <StaffChatMediaPreview selected={mediaSelection} maxFiles={10 - files.length} caption={text} onCaption={setText} onClose={() => { setMediaOpen(false); setMediaSelection([]); }} onAdd={() => mediaInput.current?.click()} onUpload={async (file) => {
      const form = new FormData(); form.set("file", file);
      return withAuthRetry(() => uploadFn({ data: form }));
    }} onSend={async (attachments, caption) => {
      if (attachments.length + files.length > 10) { toast.error("الحد الأقصى 10 مرفقات للرسالة"); return false; }
      return send([...files, ...attachments], caption);
    }} />}
    <img src={new URL(chatWallpaper.url, "https://id-preview--335637d3-bc9b-407f-9e44-b28bda5c78dc.lovable.app").href} alt="" aria-hidden="true" className="staff-chat-wallpaper" />
    <header className="staff-chat-header flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0"><span className="staff-chat-avatar flex size-10 shrink-0 items-center justify-center rounded-full"><Users className="size-5" /></span><div><h2 className="font-bold text-base">جروب MG Pro</h2><p className="text-xs text-muted-foreground mt-1">{state.members.length} أعضاء · {state.open ? "مفتوح" : "الأدمن فقط يقدر يرسل"}</p></div></div>
      {state.owner && <label className="flex gap-2 items-center text-sm"><span>مفتوح للإرسال</span><Switch checked={state.open} onCheckedChange={(open) => void act("state", { open }).catch(() => {})} /></label>}
    </header>
    <div className="staff-chat-transcript-wrap relative min-h-0 flex-1">
      <div className="staff-chat-transcript relative h-full min-h-0 overflow-y-auto px-4 py-5">
      <div className="relative min-h-full flex flex-col justify-end">
      {before && <Button variant="ghost" size="sm" onClick={() => setBefore(undefined)}>آخر الرسائل</Button>}
      {(messages.data?.length ?? 0) === 50 && <Button variant="ghost" size="sm" onClick={() => { const first = messages.data?.[0]; if (first) setBefore({ date: first.created_at, id: first.id }); }}>رسائل أقدم</Button>}
      {messagesPhase === "loading" ? <></> : messagesPhase === "retrying" ? <div className="py-4" role="status"><p className="text-muted-foreground">جاري إعادة الاتصال لتحميل الرسائل…</p><Button onClick={() => void messages.refetch()}>إعادة المحاولة</Button></div> : !messages.data?.length ? <p className="py-10 text-muted-foreground text-sm">مفيش رسائل هنا لسه</p> : messages.data.map((message: ChatMessage) => <Fragment key={message.id}>
        {message.id === unread[0]?.id && <div className="staff-chat-unread" role="status"><span>{unread.length === 1 ? "رسالة واحدة غير مقروءة" : `${unread.length} رسائل غير مقروءة`}</span></div>}
        <StaffChatMessage message={message} state={state} act={act} />
      </Fragment>)}
      {pendingTexts.map((item) => <div key={item.id} className="flex justify-end py-1" role="status"><div className="staff-chat-bubble staff-chat-outgoing min-w-0 opacity-80"><p className="whitespace-pre-wrap break-words">{item.body}</p><span className="staff-chat-message-meta flex items-center gap-1 text-xs"><Loader2 className="size-3 animate-spin" />جاري الإرسال…</span></div></div>)}
      {pendingVoices.map((voice) => <div key={voice.id} className="flex justify-end py-1" role="status"><div className="staff-chat-bubble staff-chat-outgoing min-w-0 opacity-80"><StaffChatVoice src={voice.url} sender="أنا" seed={voice.id} /><span className="staff-chat-message-meta flex items-center gap-1 text-xs"><Loader2 className="size-3 animate-spin" />جاري الإرسال…</span></div></div>)}
      <div ref={end} className="h-px shrink-0" />
      </div>
    </div>
    </div>
    <section className="staff-chat-composer shrink-0 px-3 pt-2 pb-3 space-y-2">
      {!canSend ? <></> : <>
        {recording ? <div className="staff-chat-inputbar staff-chat-recordbar flex items-center gap-2 px-2 py-1.5" aria-live="polite">
          <span className={`staff-chat-rec-dot ${paused ? "is-paused" : ""}`} aria-hidden="true" />
          <span className="tabular-nums text-sm" dir="ltr">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
          <span className={`staff-chat-rec-wave flex-1 ${paused ? "is-paused" : ""}`} aria-hidden="true" />
          <Button size="icon" variant="ghost" className="shrink-0 rounded-full" title="حذف التسجيل" aria-label="حذف التسجيل" onClick={cancelRecording}><Trash2 className="size-5" /></Button>
          <Button size="icon" variant="ghost" className="shrink-0 rounded-full text-destructive" title={paused ? "استكمال" : "إيقاف مؤقت"} aria-label={paused ? "استكمال التسجيل" : "إيقاف التسجيل مؤقتًا"} onClick={togglePause}>{paused ? <Play className="size-5" /> : <Pause className="size-5" />}</Button>
          <Button size="icon" className="staff-chat-send shrink-0 rounded-full" title="إرسال التسجيل" aria-label="إرسال التسجيل" disabled={busy} onClick={() => void record()}><Send className="size-4" /></Button>
        </div> :
        <div className="staff-chat-inputbar flex items-end gap-1 px-2 py-1.5">
          <input ref={fileInput} type="file" multiple className="hidden" aria-label="رفع مرفقات" onChange={(e) => void upload(Array.from(e.target.files ?? []))} />
          <DropdownMenu dir="rtl" open={attachmentMenuOpen} onOpenChange={(open) => { setAttachmentMenuOpen(open); if (!open) { setMentionsOpen(false); setMandatoryOpen(false); } }}>
            <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="shrink-0 rounded-full" title="المرفقات" aria-label="إرفاق ملف" disabled={busy || recording}><Paperclip className="size-5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent ref={attachmentMenuRef} side="top" align="start" sideOffset={10} collisionPadding={12} className="staff-chat-attachment-menu w-56 max-w-[calc(100vw-24px)] p-1.5" aria-label="المرفقات">
              <DropdownMenuItem className="staff-chat-attachment-item" onSelect={() => chooseFile("")}><FileText className="staff-chat-document-icon" /><span>مستند</span></DropdownMenuItem>
              <DropdownMenuItem className="staff-chat-attachment-item" onSelect={() => mediaInput.current?.click()}><Images className="staff-chat-media-icon" /><span>الصور ومقاطع الفيديو</span></DropdownMenuItem>
              <DropdownMenuItem className="staff-chat-attachment-item" onSelect={() => chooseFile("audio/webm,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/x-m4a")}><Headphones className="staff-chat-audio-icon" /><span>مقطع صوتي</span></DropdownMenuItem>
              <DropdownMenuItem className="staff-chat-attachment-item" onSelect={() => setPollOpen(!pollOpen)}><BarChart3 className="staff-chat-poll-icon" /><span>استطلاع رأي</span></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub open={mentionsOpen} onOpenChange={(open) => { setMentionsOpen(open); if (open) { setMandatoryOpen(false); alignNamesCard(mentionTriggerRef.current); } }}>
                <DropdownMenuSubTrigger ref={mentionTriggerRef} className="staff-chat-attachment-item"><AtSign className="staff-chat-media-icon" /><span>منشن {everyone ? "الجميع" : mentions.length || ""}</span></DropdownMenuSubTrigger>
                <DropdownMenuSubContent sideOffset={8} align="end" alignOffset={namesOffset} collisionPadding={12} style={{ maxHeight: namesMaxHeight }} className="staff-chat-attachment-menu staff-chat-names-menu w-56 max-w-[calc(100vw-24px)] p-1.5" aria-label="اختيار المنشن">
                  {state.role === "admin" && <DropdownMenuCheckboxItem className="min-h-10" checked={everyone} onCheckedChange={setEveryone} onSelect={(event) => event.preventDefault()}>الجميع</DropdownMenuCheckboxItem>}
                  {state.members.filter((m) => m.role === "employee").map((member) => <DropdownMenuCheckboxItem className="min-h-10" key={member.id} checked={mentions.includes(member.id)} disabled={everyone} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => setMentions((old) => checked ? [...old, member.id] : old.filter((id) => id !== member.id))}>@{member.name}</DropdownMenuCheckboxItem>)}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="staff-chat-attachment-item justify-center" onSelect={() => { setMentionsOpen(false); setAttachmentMenuOpen(false); }}>تم</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {state.role === "admin" && <DropdownMenuSub open={mandatoryOpen} onOpenChange={(open) => { setMandatoryOpen(open); if (open) { setMentionsOpen(false); alignNamesCard(mandatoryTriggerRef.current); } }}>
                <DropdownMenuSubTrigger ref={mandatoryTriggerRef} className="staff-chat-attachment-item" disabled={!state.targetedMandatory} onClick={() => setMandatory(true)}><span>قراءة إجبارية</span></DropdownMenuSubTrigger>
                <DropdownMenuSubContent sideOffset={8} align="end" alignOffset={namesOffset} collisionPadding={12} style={{ maxHeight: namesMaxHeight }} className="staff-chat-attachment-menu staff-chat-names-menu w-56 max-w-[calc(100vw-24px)] p-1.5" aria-label="اختيار الموظفين للقراءة الإجبارية">
                  <DropdownMenuCheckboxItem className="min-h-10" checked={mandatory} onCheckedChange={setMandatory} onSelect={(event) => event.preventDefault()}>تفعيل القراءة الإجبارية</DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem className="min-h-10" checked={allChatEmployeeIds(state.members).length > 0 && allChatEmployeeIds(state.members).every((id) => mandatoryMentions.includes(id))} disabled={!mandatory} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => setMandatoryMentions(checked ? allChatEmployeeIds(state.members) : [])}>الكل</DropdownMenuCheckboxItem>
                  {state.members.filter((m) => m.role === "employee").map((member) => <DropdownMenuCheckboxItem className="min-h-10" key={member.id} checked={mandatoryMentions.includes(member.id)} disabled={!mandatory} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => setMandatoryMentions((old) => checked ? [...old, member.id] : old.filter((id) => id !== member.id))}>@{member.name}</DropdownMenuCheckboxItem>)}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="staff-chat-attachment-item justify-center" onSelect={() => { setMandatoryOpen(false); setAttachmentMenuOpen(false); }}>تم</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>}
            </DropdownMenuContent>
          </DropdownMenu>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب رسالة…" aria-label="نص الرسالة" maxLength={10000} className="staff-chat-textarea min-w-0 flex-1" />
          <Button size="icon" variant={recording ? "destructive" : "ghost"} className="shrink-0" title={recording ? "إيقاف التسجيل" : "تسجيل صوتي"} aria-label={recording ? "إيقاف التسجيل" : "تسجيل صوتي"} disabled={busy} onClick={() => void record()}><Mic className="size-5" /></Button>
          <Button size="icon" className="staff-chat-send shrink-0" title="إرسال" aria-label="إرسال" disabled={busy || recording || (!text.trim() && !files.length && !pollOpen)} onClick={() => void send()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button>
        </div>}
        {files.length>0 && <div className="flex flex-wrap gap-2">{files.map((file) => <div key={file.id} className="flex gap-1 items-center bg-muted px-2 py-1 rounded text-xs max-w-full"><span className="truncate">{file.name}</span><Button size="icon" variant="ghost" className="size-6 shrink-0" aria-label={`إزالة ${file.name}`} onClick={() => setFiles((old) => old.filter((f) => f.id !== file.id))}><X className="size-3" /></Button></div>)}</div>}
        {pollOpen && <div className="border-s-2 border-primary ps-3 space-y-2"><Input placeholder="سؤال الاستطلاع" aria-label="سؤال الاستطلاع" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} />
          {options.map((option, index) => <div key={index} className="flex gap-1"><Input value={option} maxLength={200} placeholder={`اختيار ${index + 1}`} aria-label={`اختيار ${index + 1}`} onChange={(e) => setOptions((old) => old.map((v, i) => i === index ? e.target.value : v))} />{options.length>2 && <Button variant="ghost" size="icon" aria-label={`إزالة اختيار ${index+1}`} onClick={() => setOptions((old) => old.filter((_, i) => i !== index))}><X className="size-4" /></Button>}</div>)}
          <div className="flex flex-wrap gap-3 items-center"><Button size="sm" variant="outline" disabled={options.length>=20} onClick={() => setOptions((old) => [...old, ""])}>إضافة اختيار</Button><label className="text-xs flex gap-2"><input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />السماح بعدة اختيارات</label></div></div>}
      </>}
    </section>
  </div>;
}