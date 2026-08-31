/**
 * توليد رابط (slug) صالح من أي اسم — يدعم العربية والإنجليزية.
 * يمنع القيم الفارغة أو الرموز مثل "." أو "-" التي تكسر الروابط وتسبب 404.
 */
export function slugify(input: string): string {
  const base = (input || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    // نسمح بالأحرف اللاتينية والأرقام والحروف العربية والشرطة فقط
    .replace(/[^a-z0-9\u0621-\u064a-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return base;
}

/** يضمن وجود slug صالح، ويولّد بديلاً عشوائياً عند الحاجة. */
export function ensureSlug(input: string, fallbackFrom = ""): string {
  const s = slugify(input) || slugify(fallbackFrom);
  if (s) return s;
  return `item-${Math.random().toString(36).slice(2, 8)}`;
}

/** هل الرابط صالح للاستخدام في المسار؟ */
export function isValidSlug(input: string | null | undefined): boolean {
  return !!input && slugify(input).length > 0;
}
