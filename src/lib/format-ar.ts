/** تنسيقات موحّدة للتاريخ والوقت في لوحة الإدارة (عربي — ص / م) */

const weekdayAr = (ms: number) => new Date(ms).toLocaleDateString("ar-EG", { weekday: "long" });

/** 9:40:12 ص */
export const timeAr = (ms: number) => {
  const d = new Date(ms);
  const h24 = d.getHours();
  const period = h24 < 12 ? "ص" : "م";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${mm}:${ss} ${period}`;
};

/** [ الأحد - 10/08/2026 - 9:40:12 ص ] */
export const dateLineAr = (ms: number) => {
  if (!ms) return "—";
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" });
  return `[ ${weekdayAr(ms)} - ${date} - ${timeAr(ms)} ]`;
};

/** حالة موحّدة: ناجحة أو فاشلة فقط */
export function statusAr(s: string | number | null | undefined): "ناجحة" | "فاشلة" {
  const v = String(s ?? "").toLowerCase();
  if (!v) return "ناجحة";
  if (/fail|reject|declin|cancel|error|expire/.test(v)) return "فاشلة";
  return "ناجحة";
}
