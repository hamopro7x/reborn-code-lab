import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getChatState } from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { livePoll } from "@/lib/live-poll";
import { refreshQueries } from "@/lib/refresh-queries";
import { StaffChat } from "./StaffChat";
import { chatBadge } from "@/lib/chat-badge";
import { createChatSound, isNewIncomingChat, type IncomingChatCursor } from "@/lib/chat-sound";
import mandatoryNotice from "@/assets/staff-chat-mandatory-brand-colors.png";
import mandatoryOpenButton from "@/assets/staff-chat-mandatory-open-button.png";

export function StaffChatGate() {
  const [signedIn, setSignedIn] = useState(false); const [identityReady, setIdentityReady] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const qc = useQueryClient(); const stateFn = useServerFn(getChatState);
  const overlay = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => ({ path: s.location.pathname, panel: (s.location.search as { panel?: string }).panel }) });
  const onChatPanel = location.path === "/admin" && location.panel === "chat";
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
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    // Dedicated instant channel: any chat change refreshes the group immediately instead of waiting for polling.
    const channel = supabase.channel(`staff-chat-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_chat_events" }, () => {
        if (refreshTimer !== undefined) return;
        refreshTimer = setTimeout(() => {
          refreshTimer = undefined;
          void refreshQueries(qc, [["staff-chat-state"], ["staff-chat-messages"]]);
        }, 150);
      })
      .subscribe();
    return () => { if (refreshTimer !== undefined) clearTimeout(refreshTimer); void supabase.removeChannel(channel); };
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
      if (!onChatPanel) chatBadge.bump();
    }
  }, [signedIn, state]);
  useEffect(() => { if (onChatPanel) chatBadge.clear(); }, [onChatPanel]);
  const message = state?.pending[0];
  const blocked = signedIn && identityReady && state?.role === "employee" && Boolean(message);
  useEffect(() => { if (!blocked) setGroupOpen(false); }, [blocked]);
  // Opening the group shows the normal site on the chat panel; only the sidebar stays frozen.
  const reachedChat = useRef(false);
  useEffect(() => {
    if (!groupOpen) { reachedChat.current = false; return; }
    if (onChatPanel) reachedChat.current = true; else if (reachedChat.current) setGroupOpen(false);
  }, [groupOpen, onChatPanel]);
  const chatUnlocked = blocked && groupOpen;
  useEffect(() => {
    if (!chatUnlocked) return;
    document.body.classList.add("staff-chat-locked");
    const freeze = () => document.querySelectorAll<HTMLElement>('[data-sidebar="sidebar"],[data-sidebar="trigger"]').forEach((el) => { el.inert = true; });
    freeze(); const observer = new MutationObserver(freeze); observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); document.body.classList.remove("staff-chat-locked");
      document.querySelectorAll<HTMLElement>('[data-sidebar="sidebar"],[data-sidebar="trigger"]').forEach((el) => { el.inert = false; }); };
  }, [chatUnlocked]);
  const openGroup = () => { setGroupOpen(true); void navigate({ to: "/admin", search: { panel: "chat", message: message?.id } }); };
  useEffect(() => {
    if (!blocked || groupOpen || !overlay.current) return;
    const panel = overlay.current;
    const siblings = Array.from(document.body.children).filter((el) => el !== panel && el instanceof HTMLElement) as HTMLElement[];
    const previous = siblings.map((el) => el.inert);
    siblings.forEach((el) => { el.inert = true; });
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    panel.focus();
    return () => { siblings.forEach((el, index) => { el.inert = previous[index] ?? false; }); document.body.style.overflow = overflow; };
  }, [blocked, groupOpen, message?.id]);
  if (typeof document === "undefined") return null;
  if (blocked && groupOpen) return null;
  if (blocked) return createPortal(<div ref={overlay} tabIndex={-1} role="dialog" aria-modal="true" aria-label="قراءة رسائل MG Pro الإجبارية"
    className={`admin-theme fixed inset-0 z-[10000] text-foreground overflow-y-auto outline-none${groupOpen ? " bg-background" : " staff-chat-mandatory-overlay"}`} dir="rtl" onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); }
      if (event.key === "Tab") {
        const controls = overlay.current?.querySelectorAll<HTMLElement>('button,a[href],input,video,audio,[tabindex="0"]');
        const first = controls?.[0], last = controls?.[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    {groupOpen ? <StaffChat targetId={message?.id} /> : <div className="staff-chat-mandatory-screen">
      <div className="staff-chat-mandatory-notice">
        <img src={mandatoryNotice} width={1672} height={941} alt="قراءة مهمة قبل متابعة العمل. لن تتمكن من متابعة العمل حتى تقرأ الرسائل المطلوبة." />
        <Button type="button" variant="ghost" className="staff-chat-mandatory-open" aria-label="فتح الجروب" onClick={openGroup}><img src={mandatoryOpenButton} width={826} height={158} alt="" aria-hidden="true" draggable={false} /><span className="sr-only">فتح الجروب</span></Button>
      </div>
    </div>}
  </div>, document.body);
  if (!state?.enabled || !state.notifications.length) return null;
  return createPortal(<aside className="admin-theme fixed bottom-4 start-4 z-50 max-w-[calc(100vw-2rem)] w-80 bg-popover text-popover-foreground border border-border rounded-md p-3" dir="rtl" aria-label="إشعارات المنشن">
    <h2 className="font-semibold text-sm flex gap-2 items-center"><Bell className="size-4 text-primary" />منشن في جروب MG Pro</h2>
    {state.notifications.slice(0, 3).map((notification) => <Link key={notification.message_id} to="/admin" search={{ panel: "chat", message: notification.message_id }} className="block py-2 mt-1 text-sm text-primary underline break-words">{notification.body || "فتح الرسالة الأصلية"}</Link>)}
  </aside>, document.body);
}