/**
 * طبقة الاحتفاظ (Retention) المركزية — سيرفر فقط.
 *
 * القاعدة: لكل جدول سجلات/معاملات حدّ أقصى مستقل (MAX_RECORDS). طالما العدد
 * أقل من الحد لا يحدث أي حذف. عند الوصول للحد يتم حذف أقدم
 * RETENTION_DELETE_COUNT سجل بالاعتماعلى عمود الوقت (created_at أو ما يعادله)
 * على دفعات آمنة، ويُحتفظ بالأحدث.
 *
 * الجداول المسجّلة هنا هي جداول السجلات/المعاملات القابلة للنمو فقط. لا تُسجّل
 * جداول الإعدادات أو الحسابات أو البيانات الأساسية إطلاقًا.
 */
import { MAX_RECORDS, RETENTION_BATCH_SIZE, RETENTION_DELETE_COUNT } from "./pagination";

type RetentionTable = {
  /** اسم الجدول في قاعدة البيانات. */
  table: string;
  /** عمود الوقت الذي يحدّد «الأقدم». */
  timeColumn: string;
  /** المفتاح الأساسي المستخدم في الحذف. */
  idColumn?: string;
  maxRecords?: number;
  deleteCount?: number;
};

/** سجل الجداول المشمولة بسياسة الاحتفاظ (سجلات ومعاملات فقط). */
export const RETENTION_TABLES: Record<string, RetentionTable> = {
  work_manual_txns: { table: "work_manual_txns", timeColumn: "created_at" },
  work_manual_card_txns: { table: "work_manual_card_txns", timeColumn: "created_at" },
  work_txn_assignments: { table: "work_txn_assignments", timeColumn: "assigned_at" },
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type RetentionResult = {
  table: string;
  total: number;
  deleted: number;
  triggered: boolean;
};

/**
 * تنفيذ سياسة الاحتفاظ لجدول واحد. لا علاقة لها بالـPagination ولا تُشغّل عند
 * تغيير الصفحة — تُستدعى فقط بعد إدخال بيانات جديدة.
 */
export async function enforceRetention(
  key: keyof typeof RETENTION_TABLES | string,
  overrides?: { maxRecords?: number; deleteCount?: number },
): Promise<RetentionResult> {
  const cfg = RETENTION_TABLES[key as string];
  if (!cfg) return { table: String(key), total: 0, deleted: 0, triggered: false };

  const max = overrides?.maxRecords ?? cfg.maxRecords ?? MAX_RECORDS;
  const target = overrides?.deleteCount ?? cfg.deleteCount ?? RETENTION_DELETE_COUNT;
  const idCol = cfg.idColumn ?? "id";

  const db = await admin();
  const { count } = await db.from(cfg.table).select(idCol, { count: "exact", head: true });
  const total = Number(count ?? 0);
  if (total < max) return { table: cfg.table, total, deleted: 0, triggered: false };

  let deleted = 0;
  while (deleted < target) {
    const batch = Math.min(RETENTION_BATCH_SIZE, target - deleted);
    const { data, error } = await db
      .from(cfg.table)
      .select(idCol)
      .order(cfg.timeColumn, { ascending: true })
      .limit(batch);
    if (error || !data?.length) break;
    const ids = data.map((r: any) => r[idCol]);
    const { error: delErr } = await db.from(cfg.table).delete().in(idCol, ids);
    if (delErr) break;
    deleted += ids.length;
    if (ids.length < batch) break;
  }

  return { table: cfg.table, total, deleted, triggered: true };
}

/** استدعاء آمن بعد الإدخال: لا يفشل أبدًا ولا يوقف العملية الأصلية. */
export async function enforceRetentionSafe(
  key: keyof typeof RETENTION_TABLES | string,
  overrides?: { maxRecords?: number; deleteCount?: number },
): Promise<void> {
  try {
    await enforceRetention(key, overrides);
  } catch {
    /* الاحتفاظ عملية صيانة: فشلها لا يؤثر على حفظ البيانات. */
  }
}
