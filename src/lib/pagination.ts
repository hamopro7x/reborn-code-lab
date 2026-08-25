/**
 * طبقة مركزية واحدة لإدارة الصفحات (Pagination) وسياسة الاحتفاظ (Retention).
 *
 * هذه الطبقة إضافية فقط: لا تغيّر أي منطق عمل قائم. أي جدول جديد (أدمن أو
 * موظف) يستخدم نفس الإعدادات والدوال هنا بدل بناء نظام خاص به.
 *
 * الإعدادات كلها في مكان واحد — التغيير من هنا فقط.
 */

/** عدد الصفوف في الصفحة الواحدة (نفس فكرة جداول Bybit). */
export const PAGE_SIZE = 150;

/** الحد الأقصى لعدد السجلات لكل جدول على حدة. */
export const MAX_RECORDS = 10_000_000;

/** عدد الأقدم الذي يُحذف عند الوصول للحد الأقصى. */
export const RETENTION_DELETE_COUNT = 3_000_000;

/** حجم الدفعة الواحدة في عملية الحذف (آمنة على قاعدة البيانات). */
export const RETENTION_BATCH_SIZE = 5_000;

/** أقصى وأدنى حجم صفحة مسموح به من الواجهة. */
export const MIN_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 500;

export type Paged<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function normalizePageSize(pageSize?: number): number {
  return Math.min(Math.max(pageSize ?? PAGE_SIZE, MIN_PAGE_SIZE), MAX_PAGE_SIZE);
}

export function normalizePage(page?: number): number {
  return Math.max(Math.floor(page ?? 1), 1);
}

/** حدود `range()` في Supabase لصفحة معيّنة. */
export function pageRange(page?: number, pageSize?: number): { from: number; to: number; page: number; pageSize: number } {
  const size = normalizePageSize(pageSize);
  const p = normalizePage(page);
  const from = (p - 1) * size;
  return { from, to: from + size - 1, page: p, pageSize: size };
}

export function pageCount(total: number, pageSize?: number): number {
  return Math.max(1, Math.ceil(Math.max(total, 0) / normalizePageSize(pageSize)));
}

/** أرقام الصفحات المعروضة حول الصفحة الحالية. */
export function pageWindow(current: number, count: number, span = 5): number[] {
  const half = Math.floor(span / 2);
  let start = Math.max(1, current - half);
  const end = Math.min(count, start + span - 1);
  start = Math.max(1, end - span + 1);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}
