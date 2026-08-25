import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { REALTIME_TABLES, TABLE_QUERY_KEYS } from "./tables";

/**
 * طبقة Realtime عامة واحدة للموقع كامل (أدمن / موظف / مستخدم).
 *
 * - قناة واحدة فقط لكل تبويب متصفح (منع تكرار الاشتراكات و Memory Leaks).
 * - عند أي تغيير في قاعدة البيانات: invalidate للـqueries المتأثرة فقط،
 *   فتُحدَّث المكونات المعنية جزئيًا مع الحفاظ على الصفحة/البحث/الفلاتر/الترتيب.
 * - لا يوجد أي reload للصفحة، ولا polling إضافي.
 * - الصلاحيات تبقى كما هي: Realtime يمرّ عبر RLS بنفس جلسة المستخدم،
 *   فلا يستقبل أي شخص أحداث صفوف لا يستطيع قراءتها.
 */

let mounted = 0;

export function GlobalRealtime() {
  const qc = useQueryClient();
  const chRef = useRef<RealtimeChannel | null>(null);
  const pending = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // اشتراك واحد فقط حتى لو تم تركيب المكون أكثر من مرة (StrictMode / تنقّل).
    mounted += 1;
    if (mounted > 1) {
      return () => {
        mounted -= 1;
      };
    }

    let disposed = false;

    /** تجميع الأحداث المتقاربة في دفعة واحدة (debounce بسيط). */
    const flush = () => {
      timer.current = null;
      const tables = Array.from(pending.current);
      pending.current.clear();
      const prefixes = new Set<string>();
      let broad = false;
      for (const t of tables) {
        const keys = TABLE_QUERY_KEYS[t];
        if (!keys || keys.length === 0) broad = true;
        else keys.forEach((k) => prefixes.add(k));
      }
      if (broad) {
        // جدول غير معروف في الخريطة: نحدّث الـqueries النشطة فقط.
        void qc.invalidateQueries({ refetchType: "active" });
        return;
      }
      for (const p of prefixes) {
        void qc.invalidateQueries({ queryKey: [p], refetchType: "active" });
      }
    };

    const schedule = (table: string) => {
      pending.current.add(table);
      if (timer.current) return;
      timer.current = setTimeout(flush, 350);
    };

    const subscribe = () => {
      if (disposed || chRef.current) return;
      const channel = supabase.channel("global-realtime");
      for (const table of REALTIME_TABLES) {
        channel.on("postgres_changes", { event: "*", schema: "public", table }, () =>
          schedule(table),
        );
      }
      channel.subscribe();
      chRef.current = channel;
    };

    const teardown = () => {
      const ch = chRef.current;
      chRef.current = null;
      if (ch) void supabase.removeChannel(ch);
    };

    subscribe();

    /** إعادة الاتصال + مزامنة أحدث البيانات بعد رجوع الإنترنت أو رجوع التبويب. */
    const resync = () => {
      if (disposed) return;
      const state = chRef.current?.state;
      if (state !== "joined" && state !== "joining") {
        teardown();
        subscribe();
      }
      void qc.invalidateQueries({ refetchType: "active" });
    };

    const onVisible = () => {
      if (!document.hidden) resync();
    };

    window.addEventListener("online", resync);
    document.addEventListener("visibilitychange", onVisible);

    // تحديث توكن الـRealtime عند تغيّر الجلسة حتى تبقى الصلاحيات صحيحة.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token;
      try {
        supabase.realtime.setAuth(token ?? null);
      } catch {
        /* تجاهل */
      }
      teardown();
      if (!disposed) subscribe();
    });

    return () => {
      disposed = true;
      mounted -= 1;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pending.current.clear();
      sub.subscription.unsubscribe();
      window.removeEventListener("online", resync);
      document.removeEventListener("visibilitychange", onVisible);
      teardown();
    };
  }, [qc]);

  return null;
}
