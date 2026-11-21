import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2, Mail, Send, Inbox, Archive, Star, ShieldAlert, Trash2, Tag, FileText, Plus,
  Paperclip, Search, History, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MailListRow } from "@/components/admin/MailListRow";
import { supabase } from "@/integrations/supabase/client";
import { livePoll } from "@/lib/live-poll";
import {
  listMailAccounts, listMailMessages, setMailRead, listMailLabels, saveMailLabel, listMailDrafts, saveMailDraft,
} from "@/lib/mail.functions";

import { fmt, sender } from "@/components/admin/mail/MailFormatting";

import { MailAccounts } from "@/components/admin/mail/MailAccounts";

import { MailComposer as Composer } from "@/components/admin/mail/MailComposer";

import { MailThreadView, MailActivityLog } from "@/components/admin/mail/MailThreadView";
import { useMailRealtime } from "@/components/admin/mail/MailNotifications";

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

  const accounts = useQuery({ queryKey: ["mail-accounts"], queryFn: () => accFn(), refetchInterval: livePoll(30000) });
  const labels = useQuery({ queryKey: ["mail-labels"], queryFn: () => labelsFn() });
  const drafts = useQuery({ queryKey: ["mail-drafts"], queryFn: () => draftsFn(), enabled: view === "drafts" });
  const msgs = useInfiniteQuery({
    queryKey: ["mail-msgs", view, labelId, accountId, term],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listFn({ data: { view, labelId, accountId, search: term || undefined, before: pageParam } }),
    getNextPageParam: (p) => p.nextBefore ?? undefined,
    refetchInterval: livePoll(20000),
    retry: 4,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const items = useMemo(() => msgs.data?.pages.flatMap((p) => p.items) ?? [], [msgs.data]);
  const acctEmail = (id: string) => accounts.data?.find((a: any) => a.id === id)?.email ?? "";
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && msgs.hasNextPage && !msgs.isFetchingNextPage) msgs.fetchNextPage(); });
    io.observe(el);    return () => io.disconnect();
  }, [msgs]);

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
        </div>
      </div>

      {tab === "accounts" && <MailAccounts isAdmin={isAdmin} />}
      {tab === "activity" && isAdmin && <MailActivityLog />}

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

          <section className="min-w-0 space-y-2">            {draftView ? (
              <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between"><b>مسودة في الموقع (عرض فقط)</b><Button size="icon" variant="ghost" onClick={() => setDraftView(null)}><X className="h-4 w-4" /></Button></div>
                <p className="text-sm" dir="ltr">From: {acctEmail(draftView.account_id)} · To: {draftView.to_addr}{draftView.cc_addr ? ` · Cc: ${draftView.cc_addr}` : ""}</p>
                <p className="font-bold">{draftView.subject || "(بدون عنوان)"}</p>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm">{draftView.body}</pre>
              </div>
            ) : compose ? (
              <Composer accounts={activeAccounts} initial={compose} onDone={() => setCompose(null)} />
            ) : openId ? (
              <MailThreadView id={openId} isAdmin={isAdmin} accounts={accList} labels={labels.data ?? []} onBack={() => setOpenId(null)} />
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
                        onOpen={() => isAdmin ? setCompose({ draftId: d.id, accountId: d.account_id, to: d.to_addr, cc: d.cc_addr, subject: d.subject, body: d.body, replyToId: d.reply_to_message_id ?? undefined }) : setDraftView(d)}                        footer={isAdmin ? <Button className="row-start-2 h-6 w-6" size="icon" variant="ghost" onClick={async () => { await draftSaveFn({ data: { id: d.id, remove: true, accountId: d.account_id } }); qc.invalidateQueries({ queryKey: ["mail-drafts"] }); }}><Trash2 className="h-4 w-4" /></Button> : undefined}
                      />
                    ))}
                  </ul>
                )}

                {msgs.isLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : msgs.error && !items.length ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
                    <span>تعذر تحميل الرسائل، جاري إعادة المحاولة…</span>
                    <Button size="sm" variant="outline" onClick={() => msgs.refetch()}>إعادة المحاولة</Button>
                  </div>
                ) : !items.length ? (
                  <p className="p-8 text-center text-muted-foreground">{accList.length ? "لا توجد رسائل هنا" : "لا يوجد حسابات Gmail مربوطة بعد"}</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                    {items.map((m: any) => (
                      <MailListRow key={m.id} sender={view === "sent" ? `إلى: ${m.to_addr}` : sender(m.from_addr)}
                        logo={m.sender_logo_url ?? undefined}
                        account={acctEmail(m.account_id)} date={fmt(m.internal_date)} preview={m.snippet}
                        read={m.is_read} onOpen={() => setOpenId(m.id)} onToggleRead={() => toggleRead(m)}
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