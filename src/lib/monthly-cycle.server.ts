/**
 * دورة المعاملات الشهرية — سيرفر فقط.
 *
 * قاعدة واحدة لكل النظام (نفس قاعدة احتساب الصرف في Bybit):
 * بداية الدورة الجديدة هي أول لحظة (00:00 UTC) من آخر يوم في الشهر الحالي،
 * وآخر يوم نفسه يُحتسب على الدورة الجديدة. عدد أيام الشهر يُحسب تلقائيًا
 * (28/29/30/31) ولا يُفترض ثابتًا، والمرجع الزمني هو UTC فقط — لا توقيت مصر
 * ولا توقيت الجهاز ولا التوقيت الصيفي/الشتوي.
 *
 * المصدر الوحيد للحدود هو getMonthlySpendPeriod في ./bybit-spend، أي أن
 * المعاملات والصرف الشهري يستخدمان نفس النافذة بالضبط:
 * periodStart <= time < periodEnd.
 *
 * حدود الدورة تخص العرض والحساب فقط؛ لا حذف تلقائي للسجلات التاريخية.
 */
import { getMonthlySpendPeriod, type MonthlySpendPeriod } from "./bybit-spend";

/** نافذة الدورة الحالية بتوقيت UTC. */
export function currentCycle(nowMs: number = Date.now()): MonthlySpendPeriod {
  return getMonthlySpendPeriod(nowMs);
}

/**
 * بداية جديدة يدوية: كل معاملات Bybit قبل اللحظة دي اتحذفت بطلب صاحب الموقع
 * (31/10/2026 00:00:00 UTC = 2 بالليل بالقاهرة، بداية الليمت اليومي) ومتتسجلش تاني مع المزامنة.
 */
export const BYBIT_FRESH_START_MS = 1793404800000; // 31/10/2026 02:00 Cairo (UTC+2) = 00:00 UTC

/** بداية الدورة الحالية (ms, UTC) — أي شيء قبلها ينتمي لدورة قديمة. */
export function currentCycleStart(nowMs: number = Date.now()): number {
  return currentBybitCycle(nowMs).periodStart;
}

/** Shared effective boundary for reads, writes and spending after the reset. */
export function currentBybitCycle(nowMs: number = Date.now()): MonthlySpendPeriod {
  const cycle = currentCycle(nowMs);
  return { ...cycle, periodStart: Math.max(cycle.periodStart, BYBIT_FRESH_START_MS) };
}

/** هل هذه المعاملة داخل الدورة الحالية؟ (نفس نافذة الصرف الشهري) */
export function inCurrentCycle(timeMs: number, nowMs: number = Date.now()): boolean {
  const { periodStart, periodEnd } = currentBybitCycle(nowMs);
  return timeMs >= periodStart && timeMs < periodEnd;
}

export function currentBybitRows<T extends { time: number }>(rows: T[], nowMs: number = Date.now()): T[] {
  const { periodStart, periodEnd } = currentBybitCycle(nowMs);
  return rows.filter((row) => Number.isFinite(row.time) && row.time >= periodStart && row.time < periodEnd);
}

/** Compatibility result: historical data is never automatically deleted. */
export type CyclePurgeResult = {
  cycleStart: number;
  ran: boolean;
  deleted: { bybit_card_txns: number; bybit_ledger: number; card_transactions: number };
  keptForWorkSheet: number;
};

/** Kept for existing callers; cycle filtering is independent of physical retention. */
export async function runCyclePurge(_force = false, nowMs: number = Date.now()): Promise<CyclePurgeResult> {
  return {
    cycleStart: currentCycleStart(nowMs), ran: false,
    deleted: { bybit_card_txns: 0, bybit_ledger: 0, card_transactions: 0 }, keptForWorkSheet: 0,
  };
}
export async function runCyclePurgeSafe(): Promise<void> {
  // Historical financial and staff records are archival, never maintenance deletions.
}
