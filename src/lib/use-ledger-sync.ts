import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncAllBybitCardTxns } from "./bybit.functions";

const LOCK_KEY = "bybit-auto-sync-at";

/**
 * Pulls fresh Bybit movements into the central ledger (and, through it, into the
 * open shift) while a page that displays them is on screen.
 *
 * Previously nothing triggered ingestion after the cloud cron job was removed,
 * so «جميع معاملات الفيزا» and the employee sheet only caught up when someone
 * hit sync on the visa page manually. A shared localStorage timestamp keeps
 * several open tabs from syncing at the same time.
 */
export function useLedgerAutoSync(enabled = true, intervalMs = 60_000) {
  const qc = useQueryClient();
  const syncFn = useServerFn(syncAllBybitCardTxns);
  const running = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const claim = () => {
      try {
        const last = Number(localStorage.getItem(LOCK_KEY) ?? 0);
        if (Date.now() - last < intervalMs - 5_000) return false;
        localStorage.setItem(LOCK_KEY, String(Date.now()));
      } catch {
        /* storage unavailable — just sync */
      }
      return true;
    };

    const run = async () => {
      if (cancelled || running.current) return;
      if (document.visibilityState === "hidden") return;
      if (!claim()) return;
      running.current = true;
      try {
        await syncFn({ data: undefined as any });
        if (cancelled) return;
        for (const key of [
          ["bybit-ledger"],
          ["bybit-spend-totals"],
          ["my-shift-txns"],
          ["emp-shift-txns"],
          ["shift-txns"],
          ["work-transfers"],
          ["work-p2p-open"],
          ["my-work-state"],
          ["emp-work-state"],
        ]) {
          void qc.invalidateQueries({ queryKey: key });
        }
      } catch {
        /* transient failures are retried on the next tick */
      } finally {
        running.current = false;
      }
    };

    void run();
    const timer = window.setInterval(run, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs, qc, syncFn]);
}
