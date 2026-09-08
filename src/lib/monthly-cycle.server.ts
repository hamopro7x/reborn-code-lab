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
 * عند بدء دورة جديدة تُحذف فعليًا (DELETE) معاملات الدورات السابقة من:
 *   - bybit_card_txns  (معاملات الفيزا الخام)        العمود: txn_time (ms)
 *   - bybit_ledger     (المعاملات المركزية/الداخلية) العمود: occurred_at
 *   - card_transactions (معاملات كروت خارجية)        العمود: occurred_at
 *
 * مستثنى بالكامل من أي حذف تلقائي:
 *   work_shifts, work_txn_assignments, work_manual_txns,
 *   work_manual_card_txns, work_txn_entries, work_pins  (جدول بيانات الشغل)
 * ولأن work_txn_assignments.ledger_id مرتبط بـ bybit_ledger بـ ON DELETE CASCADE،
 * فأي صف سجل مرتبط بشفت موظف يُستبعد من الحذف حتى لا تُمس بيانات الشغل.
 */
import { getMonthlySpendPeriod, type MonthlySpendPeriod } from "./bybit-spend";

/** نافذة الدورة الحالية بتوقيت UTC. */
export function currentCycle(nowMs: number = Date.now()): MonthlySpendPeriod {
  return getMonthlySpendPeriod(nowMs);
}

/** بداية الدورة الحالية (ms, UTC) — أي شيء قبلها ينتمي لدورة قديمة. */
export function currentCycleStart(nowMs: number = Date.now()): number {
  return currentCycle(nowMs).periodStart;
}

/** هل هذه المعاملة داخل الدورة الحالية؟ (نفس نافذة الصرف الشهري) */
export function inCurrentCycle(timeMs: number, nowMs: number = Date.now()): boolean {
  const { periodStart, periodEnd } = currentCycle(nowMs);
  return timeMs >= periodStart && timeMs < periodEnd;
}

const STATE_KEY = "monthly_cycle_purge";
const BATCH = 2_000;
const MAX_BATCHES = 200;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type CyclePurgeResult = {
  cycleStart: number;
  ran: boolean;
  deleted: { bybit_card_txns: number; bybit_ledger: number; card_transactions: number };
  keptForWorkSheet: number;
};

/** معاملات الفيزا الخام: الحذف بالوقت الخاص بالمعاملة نفسها (txn_time). */
async function purgeCardTxns(db: any, cycleStart: number): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await db
      .from("bybit_card_txns")
      .select("txn_id")
      .lt("txn_time", cycleStart)
      .order("txn_time", { ascending: true })
      .limit(BATCH);
    if (error || !data?.length) break;
    const ids = data.map((r: any) => r.txn_id);
    const { error: delErr } = await db
      .from("bybit_card_txns")
      .delete()
      .lt("txn_time", cycleStart)
      .in("txn_id", ids);
    if (delErr) break;
    deleted += ids.length;
    if (ids.length < BATCH) break;
  }
  return deleted;
}

/**
 * السجل المركزي/الداخلي: يُحذف كل صف قبل بداية الدورة **ما عدا** الصفوف
 * المرتبطة بشفت موظف في work_txn_assignments (بيانات الشغل لا تُحذف تلقائيًا).
 */
async function purgeLedger(db: any, cycleStart: number): Promise<{ deleted: number; kept: number }> {
  const cutoff = new Date(cycleStart).toISOString();
  let deleted = 0;
  let kept = 0;
  let offset = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await db
      .from("bybit_ledger")
      .select("id")
      .lt("occurred_at", cutoff)
      .order("occurred_at", { ascending: true })
      .range(offset, offset + BATCH - 1);
    if (error || !data?.length) break;
    const ids: string[] = data.map((r: any) => String(r.id));

    // أي صف مربوط ببيانات الشغل يُترك كما هو (الأدمن وحده يحذفه يدويًا).
    const { data: assigned } = await db
      .from("work_txn_assignments")
      .select("ledger_id")
      .in("ledger_id", ids);
    const protectedIds = new Set((assigned ?? []).map((a: any) => String(a.ledger_id)));
    const removable = ids.filter((id) => !protectedIds.has(id));
    kept += ids.length - removable.length;
    offset += protectedIds.size;

    if (removable.length) {
      const { error: delErr } = await db.from("bybit_ledger").delete().in("id", removable);
      if (delErr) break;
      deleted += removable.length;
    }
    if (ids.length < BATCH) break;
  }
  return { deleted, kept };
}

/** معاملات الكروت الخارجية (webhook) — نفس قاعدة الدورة. */
async function purgeCardTransactions(db: any, cycleStart: number): Promise<number> {
  const cutoff = new Date(cycleStart).toISOString();
  let deleted = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await db
      .from("card_transactions")
      .select("id")
      .lt("occurred_at", cutoff)
      .order("occurred_at", { ascending: true })
      .limit(BATCH);
    if (error || !data?.length) break;
    const ids = data.map((r: any) => r.id);
    const { error: delErr } = await db.from("card_transactions").delete().in("id", ids);
    if (delErr) break;
    deleted += ids.length;
    if (ids.length < BATCH) break;
  }
  return deleted;
}

/**
 * تنفيذ الدورة تلقائيًا: يقارن بداية الدورة الحالية (UTC) بآخر بداية مسجّلة،
 * وعند اختلافها تُحذف معاملات الدورات السابقة فعليًا. لا تدخل يدوي ولا Cron.
 * `force` للاستدعاء المباشر من الأدمن فقط.
 */
export async function runCyclePurge(force = false, nowMs: number = Date.now()): Promise<CyclePurgeResult> {
  const cycleStart = currentCycleStart(nowMs);
  const db = await admin();

  const { data: state } = await db
    .from("site_settings")
    .select("value")
    .eq("key", STATE_KEY)
    .maybeSingle();
  const lastStart = Number((state?.value as any)?.cycleStart ?? 0);
  const lastRunAt = Number((state?.value as any)?.lastRunAt ?? 0);

  // نفس الدورة ولا تجاوزنا 6 ساعات من آخر تنظيف: لا حاجة لأي حذف.
  if (!force && lastStart === cycleStart && nowMs - lastRunAt < 6 * 3600_000) {
    return {
      cycleStart,
      ran: false,
      deleted: { bybit_card_txns: 0, bybit_ledger: 0, card_transactions: 0 },
      keptForWorkSheet: 0,
    };
  }

  const cardTxns = await purgeCardTxns(db, cycleStart);
  const ledger = await purgeLedger(db, cycleStart);
  const external = await purgeCardTransactions(db, cycleStart);

  await db
    .from("site_settings")
    .upsert(
      { key: STATE_KEY, value: { cycleStart, lastRunAt: nowMs, deleted: cardTxns + ledger.deleted + external } },
      { onConflict: "key" },
    );

  return {
    cycleStart,
    ran: true,
    deleted: { bybit_card_txns: cardTxns, bybit_ledger: ledger.deleted, card_transactions: external },
    keptForWorkSheet: ledger.kept,
  };
}

/** استدعاء آمن بعد المزامنة: فشل التنظيف لا يوقف حفظ المعاملات الجديدة. */
export async function runCyclePurgeSafe(): Promise<void> {
  try {
    await runCyclePurge();
  } catch (e) {
    console.error("monthly cycle purge skipped:", (e as Error)?.message);
  }
}
