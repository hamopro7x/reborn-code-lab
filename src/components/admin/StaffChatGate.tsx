import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCheck, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getChatState, mutateChat } from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { livePoll } from "@/lib/live-poll";
import { StaffChatMessage } from "./StaffChatMessage";
import { createChatSound, isNewIncomingChat, type IncomingChatCursor } from "@/lib/chat-sound";

export function StaffChatGate() {
  const [signedIn, setSignedIn] = useState(false); const [identityReady, setIdentityReady] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const qc = useQueryClient(); const stateFn = useServerFn(getChatState); const mutationFn = useServerFn(mutateChat);
  const overlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => { if (active) { setSignedIn(Boolean(data.user)); setIdentityReady(true); } });
    const recheck = () => { void supabase.auth.getUser().then(({ data }) => { if (active) setSignedIn(Boolean(data.user)); }); };
    window.addEventListener("focus", recheck);
    const timer = window.setInterval(recheck, 15000);
    return () => { active = false; window.removeEventListener("focus", recheck); window.clearInterval(timer); };
  }, []);
  const status = useQuery({ queryKey: ["staff-chat-state"], queryFn: () => stateFn(), enabled: signedIn,
    refetchInterval: livePoll(5000), refetchIntervalInBackground: false, staleTime: 0, retry: 3, retryDelay: (n) => Math.min(1000 * 2 ** n, 5000) });
  const state = status.data;
  useEffect(() => {
    if (!signedIn) return;
    // Dedicated instant channel: any chat change refreshes the group immediately instead of waiting for polling.
    const channel = supabase.channel(`staff-chat-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_chat_events" }, () => {
        void qc.refetchQueries({ queryKey: ["staff-chat-state"], type: "active" });
        void qc.refetchQueries({ queryKey: ["staff-chat-messages"], type: "active" });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [signedIn, qc]);
  const sound = useRef<ReturnType<typeof createChatSound> | null>(null);
  const incoming = useRef<{ userId: string; cursor: IncomingChatCursor } | null>(null);
  useEffect(() => {
    const audio = createChatSound(); sound.current = audio;
    window.addEventListener("pointerdown", audio.unlock);
    window.addEventListener("keydown", audio.unlock);
    return () => { window.removeEventListener("pointerdown", audio.unlock); window.removeEventListener("keydown", audio.unlock); audio.dispose(); sound.current = null; };
  }, []);
  useEffect(() => {
    if (!signedIn) { incoming.current = null; return; }
    if (!state?.enabled || state.incoming === undefined) return;
    if (!incoming.current || incoming.current.userId !== state.userId) {
      incoming.current = { userId: state.userId, cursor: state.incoming }; return;
    }
    if (isNewIncomingChat(incoming.current.cursor, state.incoming)) {
      incoming.current.cursor = state.incoming;
      sound.current?.play();
    }
  }, [signedIn, state]);
  const message = state?.pending[0];
  const blocked = signedIn && (!identityReady || status.isPending || (status.isError && !state) || (state?.role === "employee" && Boolean(message)));
  useEffect(() => {
    if (!blocked || !overlay.current) return;
    const panel = overlay.current;
    const siblings = Array.from(document.body.children).filter((el) => el !== panel && el instanceof HTMLElement) as HTMLElement[];
    const previous = siblings.map((el) => el.inert);
    siblings.forEach((el) => { el.inert = true; });
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    panel.focus();
    return () => { siblings.forEach((el, index) => { el.inert = previous[index] ?? false; }); document.body.style.overflow = overflow; };
  }, [blocked, message?.id]);
  const acknowledge = async () => {
    if (!message) return;
    setBusy(true); setError("");
    try { await mutationFn({ data: { action: "ack", payload: { id: message.id } } }); await qc.invalidateQueries({ queryKey: ["staff-chat-state"] }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "تعذر حفظ تأكيد القراءة"); }
    finally { setBusy(false); }
  };
  if (typeof document === "undefined") return null;
  if (blocked) return createPortal(<div ref={overlay} tabIndex={-1} role="dialog" aria-modal="true" aria-label="قراءة رسائل MG Pro الإجبارية"
    className="admin-theme fixed inset-0 z-[10000] bg-background text-foreground overflow-y-auto outline-none" dir="rtl" onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); }
      if (event.key === "Tab") {
        const controls = overlay.current?.querySelectorAll<HTMLElement>('button,a[href],input,video,audio,[tabindex="0"]');
        const first = controls?.[0], last = controls?.[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <header className="border-b border-border pb-4"><h2 className="text-xl font-bold flex gap-2 items-center"><CheckCheck className="size-5 text-primary" />رسائل MG Pro</h2>
        {message && <p className="text-sm text-muted-foreground mt-2">قراءة إجبارية · {state?.pending.length} رسائل مستحقة</p>}</header>
      {status.isError && !state ? <div className="py-8 space-y-3"><p className="text-destructive">تعذر التحقق من الرسائل المطلوبة</p><Button onClick={() => void status.refetch()}>إعادة المحاولة</Button></div>
        : message && state ? <><StaffChatMessage message={message} state={state} forced act={async () => {}} />
          {error && <p className="text-destructive text-sm py-2">{error}</p>}
          <Button className="mt-5 w-full sm:w-auto" disabled={busy} onClick={() => void acknowledge()}>{busy ? "جاري تأكيد القراءة…" : "تمت القراءة"}</Button></>
        : <p className="py-8 text-muted-foreground">جاري التحقق من الرسائل…</p>}
    </div>
  </div>, document.body);
  if (!state?.enabled || !state.notifications.length) return null;
  return createPortal(<aside className="admin-theme fixed bottom-4 start-4 z-50 max-w-[calc(100vw-2rem)] w-80 bg-popover text-popover-foreground border border-border rounded-md p-3" dir="rtl" aria-label="إشعارات المنشن">
    <h2 className="font-semibold text-sm flex gap-2 items-center"><Bell className="size-4 text-primary" />منشن في جروب MG Pro</h2>
    {state.notifications.slice(0, 3).map((notification) => <Link key={notification.message_id} to="/admin" search={{ panel: "chat", message: notification.message_id }} className="block py-2 mt-1 text-sm text-primary underline break-words">{notification.body || "فتح الرسالة الأصلية"}</Link>)}
  </aside>, document.body);
}