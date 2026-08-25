import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * تحديث لحظي (Realtime) لجدول بيانات الشغل.
 *
 * الوظيفة الوحيدة لهذا الـhook: الاستماع لتغيّرات الجداول المركزية
 * (bybit_ledger / work_txn_assignments / المعاملات اليدوية) ثم عمل
 * invalidate للـqueries المتأثرة فقط — بنفس الـserver functions والفلاتر
 * الحالية. لا يغيّر أي Logic خاص بمن يرى ماذا.
 *
 * الـpolling الحالي يبقى كـfallback عند انقطاع الـWebSocket.
 */
export function useWorkRealtime(opts: {
  enabled: boolean;
  shiftId?: string | null;
  viewUserId?: string | null;
}) {
  const qc = useQueryClient();
  const { enabled, shiftId = null, viewUserId = null } = opts;

  // نحفظ الـqueryClient/المفاتيح في ref حتى لا يُعاد إنشاء الاشتراك مع كل render.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const shiftMode = !!shiftId;

    const keysFor = (group: "txns" | "p2p" | "transfers" | "manual"): QueryKey[] => {
      if (group === "txns") {
        return shiftMode
          ? [["shift-txns", shiftId]]
          : viewUserId
            ? [["emp-shift-txns", viewUserId]]
            : [["my-shift-txns"]];
      }
      if (group === "p2p") {
        return shiftMode
          ? [["shift-p2p", shiftId]]
          : viewUserId
            ? [["emp-shift-p2p", viewUserId]]
            : [["my-shift-p2p"], ["work-p2p-open"]];
      }
      if (group === "transfers") {
        return shiftMode
          ? [
              ["shift-transfers", shiftId, "external"],
              ["shift-transfers", shiftId, "internal"],
            ]
          : [
              ["work-transfers", "external"],
              ["work-transfers", "internal"],
            ];
      }
      return [["my-manual-card-txns"], ["my-manual-txns"]];
    };

    /** تجميع الأحداث المتقاربة في invalidate واحد (debounce بسيط). */
    const flush = () => {
      timerRef.current = null;
      const groups = Array.from(pendingRef.current) as Array<
        "txns" | "p2p" | "transfers" | "manual"
      >;
      pendingRef.current.clear();
      for (const g of groups) {
        for (const key of keysFor(g)) void qc.invalidateQueries({ queryKey: key });
      }
    };
    const schedule = (...groups: Array<"txns" | "p2p" | "transfers" | "manual">) => {
      groups.forEach((g) => pendingRef.current.add(g));
      if (timerRef.current) return;
      timerRef.current = setTimeout(flush, 400);
    };

    const channel = supabase
      .channel(`work-sheet:${shiftId ?? viewUserId ?? "me"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bybit_ledger" },
        (payload) => {
          // في وضع الشفت المحدد: صفوف الشفت تأتي عبر جدول الربط،
          // لذا الإدراج الجديد غير المرتبط لا يؤثر على العرض الحالي.
          if (shiftId && payload.eventType === "INSERT") return;
          schedule("txns", "p2p", "transfers");
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_txn_assignments" },
        (payload) => {
          const row = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
          // تحديث فقط إذا كان الحدث يخص الشفت المعروض.
          if (shiftId && row["shift_id"] && row["shift_id"] !== shiftId) return;
          schedule("txns", "p2p", "transfers");
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_manual_card_txns" },
        () => schedule("manual"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_manual_txns" },
        () => schedule("manual"),
      )
      .subscribe();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current.clear();
      void supabase.removeChannel(channel);
    };
  }, [enabled, shiftId, viewUserId, qc]);
}
