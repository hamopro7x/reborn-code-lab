import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { refreshQueries } from "@/lib/refresh-queries";
import { livePoll } from "@/lib/live-poll";
import { supabase } from "@/integrations/supabase/client";
import { claimMailNotifications } from "@/lib/mail.functions";

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

/** Live updates for staff: realtime invalidation (RLS-scoped) with polling fallback in queries. */
export function useMailRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const keys = new Set<string>();
    const schedule = (...next: string[]) => {
      next.forEach((key) => keys.add(key));
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        void refreshQueries(qc, [...keys].map((key) => [key]));
        keys.clear();
      }, 350);
    };
    const ch = supabase
      .channel(`mail-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mail_messages" }, () => {
        schedule("mail-msgs", "mail-notif", "mail-unread");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "mail_accounts" }, () => schedule("mail-accounts"))
      .subscribe();
    return () => { if (timer !== undefined) clearTimeout(timer); supabase.removeChannel(ch); };
  }, [qc]);
}

/** Mounted once in the admin shell: in-site + system notifications, de-duplicated per user on the server. */
export function MailNotifier({ onOpen }: { onOpen?: (messageId: string) => void }) {
  const claimFn = useServerFn(claimMailNotifications);
  const q = useQuery({ queryKey: ["mail-notif"], queryFn: () => claimFn(), refetchInterval: livePoll(15000), retry: false, staleTime: 0 });
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

