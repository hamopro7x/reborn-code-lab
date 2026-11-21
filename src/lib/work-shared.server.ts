import { admin, type DB } from "./work-db.server";

export function dayKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** Saturday-based week start (matches the weekly report example). */

export function weekKey(ms: number): string {
  const d = new Date(`${dayKey(ms)}T00:00:00Z`);
  const shift = (d.getUTCDay() + 1) % 7; // Sat = 0
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

export async function namesFor(db: DB, ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const { data } = await db.from("profiles").select("id,full_name,email").in("id", uniq);
  return new Map((data ?? []).map((p: any) => [p.id, p.full_name || p.email || "موظف"]));
}

/* --------------------------- shifts / current --------------------------- */

export const SUCCESS_STATUSES = ["success", "ناجحة", "اكتملت"] as const;

/** Compact totals over the complete shift; provider detail stays on the paged row endpoint. */

export const TRANSFER_KINDS = {
  external: ["deposit", "withdraw"],
  internal: ["internal_in", "internal_out"],
} as const;

export const NOTE_EDIT_WINDOW_MS = 10 * 60 * 1000;

/** تحويلات شفت الموظف المفتوح فقط (فاضي لو مفيش شفت). */

export const EDIT_WINDOW_MS = 5 * 60 * 1000;

export type ManualCard = "wrong" | "employee" | "receive" | "transfer";

/**
 * Manual rows are part of the SHIFT record: every row carries the shift it was
 * written during (`shift_id`). Passing a shift id returns that shift's history
 * only; ended shifts keep their rows for good (nothing is ever deleted).
 */
/** الصف الفاضي (بلا مبلغ وبلا تفاصيل) يُحذف بعد 5 دقائق من إنشائه — بشفت أو بدون. */

export const MANUAL_EMPTY_ROW_TTL_MS = 5 * 60 * 1000;

/**
 * تنظيف الصفوف الفاضية: أي صف لم يُكتب فيه أي قيمة (amount = null و details فاضي)
 * ومر على إنشائه أكثر من 5 دقائق يُحذف نهائيًا، حتى لو الموظف ماسك الشفت.
 * الصفوف التي فيها أي بيانات لا تُلمس إطلاقًا.
 */

export const MANUAL_NO_SHIFT_VISIBLE_MS = 10 * 60 * 1000;

/**
 * صفوف الموظف الظاهرة الآن: صفوف الشفت المفتوح (طوال الشفت) + الصفوف التي
 * أُنشئت بدون شفت خلال آخر 10 دقائق. لا شيء يُحذف من قاعدة البيانات.
 */

export const MANUAL_CARD_EDIT_MS = 10 * 60 * 1000;
