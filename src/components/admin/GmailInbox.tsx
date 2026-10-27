import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2, Mail, Send, ArrowRight, Inbox, Archive, Star, ShieldAlert, Trash2, Tag, FileText, Plus, RefreshCw,
  Pause, Play, Paperclip, Search, Reply, History, X, RotateCcw, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MailListRow } from "@/components/admin/MailListRow";
import { supabase } from "@/integrations/supabase/client";
import { safeEmailDocument } from "@/lib/mail/mime";
import {
  listMailAccounts, startMailLink, setMailAccountPaused, deleteMailAccount, syncMailNow, listMailMessages,
  getMailThread, setMailRead, organizeMail, listMailLabels, saveMailLabel, downloadMailAttachment, sendMail,
  listMailDrafts, saveMailDraft, mailUnreadCount, claimMailNotifications, listMailActivity,
} from "@/lib/mail.functions";

type View = "inbox" | "sent" | "drafts" | "archive" | "starred" | "spam" | "trash" | "label" | "all";
const VIEWS: { key: View; label: string; icon: any }[] = [
  { key: "inbox", label: "الوارد", icon: Inbox },
  { key: "starred", label: "المميزة", icon: Star },
  { key: "sent", label: "المرسل", icon: Send },
  { key: "drafts", label: "المسودات", icon: FileText },
  { key: "archive", label: "الأرشيف", icon: Archive },
  { key: "spam", label: "المزعج", icon: ShieldAlert },
  { key: "trash", label: "المحذوفات", icon: Trash2 },
];
const STATUS: Record<string, string> = { active: "متصل", paused: "موقوف", error: "خطأ مؤقت", reauth_required: "يحتاج إعادة ربط" };

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
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—");
const sender = (f?: string | null) => (f ?? "").replace(/<.*>/, "").replace(/"/g, "").trim() || f || "—";

/** Live updates for staff: realtime invalidation (RLS-scoped) with polling fallback in queries. */
function useMailRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`mail-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mail_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["mail-msgs"] });
        qc.invalidateQueries({ queryKey: ["mail-notif"] });
        qc.invalidateQueries({ queryKey: ["mail-unread"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "mail_accounts" }, () => qc.invalidateQueries({ queryKey: ["mail-accounts"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
}

/** Mounted once in the admin shell: in-site + system notifications, de-duplicated per user on the server. */
export function MailNotifier({ onOpen }: { onOpen?: (messageId: string) => void }) {
  const claimFn = useServerFn(claimMailNotifications);
  const q = useQuery({ queryKey: ["mail-notif"], queryFn: () => claimFn(), refetchInterval: 15000, retry: false, staleTime: 0 });
  const handled = useRef(new Set<string>());
  useMailRealtime();
  useEffect(() => {
    // Server already claimed these atomically; the local set only guards React re-renders.
    const fresh = (q.data ?? []).filter((n: any) => !handled.current.has(n.id));
    if (!fresh.length) return;
    fresh.forEach((n: any) => handled.current.add(n.id));
    // Sound only — no popups on screen or from the browser.
    beep();
  }, [q.data]);
  return null;
}

export function useMailUnread() {
  const fn = useServerFn(mailUnreadCount);
  return useQuery({ queryKey: ["mail-unread"], queryFn: () => fn(), refetchInterval: 15000, retry: false }).data?.unread ?? 0;
}

function Accounts({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listMailAccounts);
  const linkFn = useServerFn(startMailLink);
  const pauseFn = useServerFn(setMailAccountPaused);
  const delFn = useServerFn(deleteMailAccount);
  const syncFn = useServerFn(syncMailNow);
  const q = useQuery({ queryKey: ["mail-accounts"], queryFn: () => listFn(), refetchInterval: 30000 });
  const [busy, setBusy] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["mail-accounts"] });

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== popupRef.current || e.data?.type !== "mgpro-mail-oauth") return;
      popupRef.current = null;
      e.data.ok ? toast.success(e.data.message) : toast.error(e.data.message);
      refresh();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  });

  const link = async () => {
    const popup = window.open("", "mgpro-mail-oauth", "width=520,height=680");
    popupRef.current = popup;
    if (!popup) return toast.error("افتح السماح بالنوافذ المنبثقة");
    try {
      const { url } = await linkFn();
      popup.location.href = url;
    } catch (e: any) {
      popup.close();
      toast.error(e?.message ?? "تعذر بدء الربط");
    }
  };
  const run = async (id: string, f: () => Promise<any>, ok: string) => {
    setBusy(id);
    try { await f(); toast.success(ok); refresh(); qc.invalidateQueries({ queryKey: ["mail-msgs"] }); }
    catch (e: any) { toast.error(e?.message ?? "حدث خطأ"); }
    finally { setBusy(null); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-bold">حسابات Gmail</h3>
        {isAdmin && <Button size="sm" onClick={link}><Plus className="ms-1 h-4 w-4" />إضافة جيميل</Button>}
      </div>
      {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : q.error ? (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : !q.data?.length ? (
        <p className="text-sm text-muted-foreground">لا يوجد حسابات مربوطة بعد.</p>
      ) : (
        <ul className="space-y-2">
          {q.data.map((a: any) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm">
              <Mail className="h-4 w-4 text-primary" />
              <span className="font-medium" dir="ltr">{a.email}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${a.status === "active" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>{STATUS[a.status] ?? a.status}</span>
              <span className="text-xs text-muted-foreground">آخر مزامنة: {fmt(a.last_sync_at)}</span>
              {a.last_error && a.status !== "active" && <span className="text-xs text-destructive">{a.last_error}</span>}
              {isAdmin && (
                <div className="ms-auto flex gap-1">
                  {busy === a.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Button size="icon" variant="ghost" title="مزامنة الآن" onClick={() => run(a.id, () => syncFn({ data: { accountId: a.id } }), "تمت المزامنة")}><RefreshCw className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="إعادة ربط" onClick={link}><Link2 className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title={a.status === "paused" ? "تشغيل" : "إيقاف"} onClick={() => run(a.id, () => pauseFn({ data: { id: a.id, paused: a.status !== "paused" } }), "تم")}>
                    {a.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" title="حذف" onClick={() => {
                    if (confirm(`حذف ${a.email}؟ سيتم مسح كل رسائله ومسوداته من الموقع فقط، ولن يتغير شيء في Gmail.`)) run(a.id, () => delFn({ data: { id: a.id } }), "تم حذف الحساب");
                  }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Composer({ accounts, initial, onDone }: { accounts: any[]; initial: any; onDone: () => void }) {
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
        <Button variant="outline" onClick={saveDraft}>حفظ كمسودة</Button>
      </div>
    </div>
  );
}

function ThreadView({ id, isAdmin, accounts, labels, onBack }: { id: string; isAdmin: boolean; accounts: any[]; labels: any[]; onBack: () => void }) {
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
              <iframe title="email" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin" scrolling="no"
                className="w-full rounded-md border border-border bg-background"
                srcDoc={safeEmailDocument(m.body_html)}
                onLoad={(e) => {
                  const f = e.currentTarget;
                  try {
                    const d = f.contentDocument;
                    const h = Math.max(d?.documentElement?.scrollHeight ?? 0, d?.body?.scrollHeight ?? 0);
                    if (h) f.style.height = `${Math.ceil(h)}px`;
                  } catch {}
                }} />
            ) : (
              <pre className="whitespace-pre-wrap break-words font-sans text-sm">{m.body_text || m.snippet}</pre>
            )}
            {atts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {atts.map((a: any) => (
                  <Button key={a.id} size="sm" variant="secondary" onClick={() => download(a)}><Paperclip className="ms-1 h-3 w-3" />{a.filename} <span className="text-xs opacity-70">({Math.ceil((a.size_bytes ?? 0) / 1024)}KB)</span></Button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {replyTo && isAdmin && (
        <Composer accounts={accounts} onDone={() => setReplyTo(null)}
          initial={{ accountId: replyTo.account_id, replyToId: replyTo.id, to: (replyTo.from_addr.match(/<([^>]+)>/)?.[1] ?? replyTo.from_addr), subject: /^re:/i.test(replyTo.subject ?? "") ? replyTo.subject : `Re: ${replyTo.subject ?? ""}` }} />
      )}
    </div>
  );
}

function ActivityLog() {
  const fn = useServerFn(listMailActivity);
  const q = useQuery({ queryKey: ["mail-activity"], queryFn: () => fn(), refetchInterval: 30000 });
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

export function GmailInbox({ isAdmin = false }: { isAdmin?: boolean }) {
  const qc = useQueryClient();
  const accFn = useServerFn(listMailAccounts);
  const listFn = useServerFn(listMailMessages);
  const labelsFn = useServerFn(listMailLabels);
  const labelSaveFn = useServerFn(saveMailLabel);
  const readFn = useServerFn(setMailRead);
  const draftsFn = useServerFn(listMailDrafts);
  const draftSaveFn = useServerFn(saveMailDraft);
  const [view, setView] = useState<View>("inbox");
  const [labelId, setLabelId] = useState<string | undefined>();
  const [accountId, setAccountId] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [compose, setCompose] = useState<any | null>(null);
  const [tab, setTab] = useState<"mail" | "accounts" | "activity">("mail");
  const [draftView, setDraftView] = useState<any | null>(null);
  useMailRealtime();

  useEffect(() => { const t = setTimeout(() => setTerm(search), 350); return () => clearTimeout(t); }, [search]);

  const accounts = useQuery({ queryKey: ["mail-accounts"], queryFn: () => accFn(), refetchInterval: 30000 });
  const labels = useQuery({ queryKey: ["mail-labels"], queryFn: () => labelsFn() });
  const drafts = useQuery({ queryKey: ["mail-drafts"], queryFn: () => draftsFn(), enabled: view === "drafts" });
  const msgs = useInfiniteQuery({
    queryKey: ["mail-msgs", view, labelId, accountId, term],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listFn({ data: { view, labelId, accountId, search: term || undefined, before: pageParam } }),
    getNextPageParam: (p) => p.nextBefore ?? undefined,
    refetchInterval: 20000,
  });
  const items = useMemo(() => msgs.data?.pages.flatMap((p) => p.items) ?? [], [msgs.data]);
  const acctEmail = (id: string) => accounts.data?.find((a: any) => a.id === id)?.email ?? "";
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && msgs.hasNextPage && !msgs.isFetchingNextPage) msgs.fetchNextPage(); });
    io.observe(el);
    return () => io.disconnect();
  }, [msgs]);

  const askNotify = () => {
    if (typeof Notification === "undefined") return toast.error("المتصفح لا يدعم الإشعارات");
    Notification.requestPermission().then((p) => toast(p === "granted" ? "تم تفعيل إشعارات الجهاز" : "لم يتم السماح بالإشعارات"));
  };
  const toggleRead = async (m: any) => {
    try { await readFn({ data: { ids: [m.id], read: !m.is_read } }); qc.invalidateQueries({ queryKey: ["mail-msgs"] }); }
    catch (e: any) { toast.error(e?.message ?? "حدث خطأ"); }
  };
  const addLabel = async () => {
    const name = prompt("اسم التصنيف");
    if (!name) return;
    try { await labelSaveFn({ data: { name } }); qc.invalidateQueries({ queryKey: ["mail-labels"] }); } catch (e: any) { toast.error(e?.message); }
  };

  const accList = accounts.data ?? [];
  const activeAccounts = accList.filter((a: any) => a.status !== "paused");

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold"><Mail className="h-5 w-5 text-primary" />البريد</h2>
        <div className="ms-auto flex flex-wrap gap-1">
          <Button size="sm" variant={tab === "mail" ? "default" : "outline"} onClick={() => setTab("mail")}>الرسائل</Button>
          <Button size="sm" variant={tab === "accounts" ? "default" : "outline"} onClick={() => setTab("accounts")}>الحسابات</Button>
          {isAdmin && <Button size="sm" variant={tab === "activity" ? "default" : "outline"} onClick={() => setTab("activity")}><History className="ms-1 h-4 w-4" />السجل</Button>}
          <Button size="sm" variant="ghost" onClick={askNotify}>تفعيل الإشعارات</Button>
        </div>
      </div>

      {tab === "accounts" && <Accounts isAdmin={isAdmin} />}
      {tab === "activity" && isAdmin && <ActivityLog />}

      {tab === "mail" && (
        <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
          <aside className="space-y-1 rounded-xl border border-border bg-card p-2">
            {isAdmin && activeAccounts.length > 0 && (
              <Button className="mb-2 w-full" onClick={() => { setOpenId(null); setCompose({}); }}><Plus className="ms-1 h-4 w-4" />رسالة جديدة</Button>
            )}
            <div className="flex gap-1 overflow-x-auto lg:flex-col">
              {VIEWS.map((v) => (
                <button key={v.key} onClick={() => { setView(v.key); setLabelId(undefined); setOpenId(null); setDraftView(null); }}
                  className={`flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm ${view === v.key ? "bg-primary/15 text-primary" : "hover:bg-muted"}`}>
                  <v.icon className="h-4 w-4" />{v.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between px-2 text-xs text-muted-foreground"><span>التصنيفات</span>{isAdmin && <button onClick={addLabel}><Plus className="h-3 w-3" /></button>}</div>
            <div className="flex gap-1 overflow-x-auto lg:flex-col">
              {(labels.data ?? []).map((l: any) => (
                <button key={l.id} onClick={() => { setView("label"); setLabelId(l.id); setOpenId(null); }}
                  className={`flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm ${labelId === l.id ? "bg-primary/15 text-primary" : "hover:bg-muted"}`}>
                  <Tag className="h-4 w-4" style={{ color: l.color }} />{l.name}
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0 space-y-2">
            {draftView ? (
              <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between"><b>مسودة في الموقع (عرض فقط)</b><Button size="icon" variant="ghost" onClick={() => setDraftView(null)}><X className="h-4 w-4" /></Button></div>
                <p className="text-sm" dir="ltr">From: {acctEmail(draftView.account_id)} · To: {draftView.to_addr}{draftView.cc_addr ? ` · Cc: ${draftView.cc_addr}` : ""}</p>
                <p className="font-bold">{draftView.subject || "(بدون عنوان)"}</p>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm">{draftView.body}</pre>
              </div>
            ) : compose ? (
              <Composer accounts={activeAccounts} initial={compose} onDone={() => setCompose(null)} />
            ) : openId ? (
              <ThreadView id={openId} isAdmin={isAdmin} accounts={accList} labels={labels.data ?? []} onBack={() => setOpenId(null)} />
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <div className="relative min-w-[180px] flex-1">
                    <Search className="absolute end-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="بحث في الرسائل" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <select className="rounded-md border border-input bg-background p-2 text-sm" value={accountId ?? ""} onChange={(e) => setAccountId(e.target.value || undefined)}>
                    <option value="">كل الحسابات</option>
                    {accList.map((a: any) => <option key={a.id} value={a.id}>{a.email}</option>)}
                  </select>
                </div>

                {view === "drafts" && (drafts.data ?? []).length > 0 && (
                  <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                    {(drafts.data ?? []).map((d: any) => (
                      <MailListRow key={d.id} sender={`إلى ${d.to_addr || "—"}`} account={acctEmail(d.account_id)} date={fmt(d.updated_at)} preview={d.body}
                        subject={<><span className="me-2 rounded bg-secondary px-1.5 py-0.5 text-[11px]">مسودة في الموقع</span>{d.subject || "(بدون عنوان)"}</>}
                        onOpen={() => isAdmin ? setCompose({ draftId: d.id, accountId: d.account_id, to: d.to_addr, cc: d.cc_addr, subject: d.subject, body: d.body, replyToId: d.reply_to_message_id ?? undefined }) : setDraftView(d)}
                        footer={isAdmin ? <Button className="row-start-2 h-6 w-6" size="icon" variant="ghost" onClick={async () => { await draftSaveFn({ data: { id: d.id, remove: true, accountId: d.account_id } }); qc.invalidateQueries({ queryKey: ["mail-drafts"] }); }}><Trash2 className="h-4 w-4" /></Button> : undefined}
                      />
                    ))}
                  </ul>
                )}

                {msgs.isLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : msgs.error ? (
                  <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{(msgs.error as Error).message}</p>
                ) : !items.length ? (
                  <p className="p-8 text-center text-muted-foreground">{accList.length ? "لا توجد رسائل هنا" : "لا يوجد حسابات Gmail مربوطة بعد"}</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                    {items.map((m: any) => (
                      <MailListRow key={m.id} sender={view === "sent" ? `إلى: ${m.to_addr}` : sender(m.from_addr)}
                        account={acctEmail(m.account_id)} date={fmt(m.internal_date)} preview={m.snippet}
                        read={m.is_read} starred={m.starred} onOpen={() => setOpenId(m.id)} onToggleRead={() => toggleRead(m)}
                        subject={<>
                          {m.has_attachments && <Paperclip className="me-1 inline h-3 w-3" />}
                          {m.folder === "drafts" && <span className="me-1 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-normal">مسودة في Gmail</span>}
                          {m.subject || "(بدون عنوان)"}
                        </>}
                      />
                    ))}
                  </ul>
                )}
                <div ref={sentinel} className="h-6">{msgs.isFetchingNextPage && <Loader2 className="mx-auto h-4 w-4 animate-spin" />}</div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
