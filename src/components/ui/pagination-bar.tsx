/**
 * شريط صفحات موحّد لكل جداول المشروع (نفس فكرة جداول Bybit).
 * لا يغيّر تصميم أي جدول — يُضاف أسفل الجدول فقط.
 */
import { pageCount, pageWindow } from "@/lib/pagination";

export function PaginationBar({
  page,
  total,
  pageSize,
  onPage,
  className = "",
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  const count = pageCount(total, pageSize);
  if (total <= pageSize) return null;
  const current = Math.min(Math.max(page, 1), count);
  const pages = pageWindow(current, count);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-3 py-3 ${className}`} dir="rtl">
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {total.toLocaleString("en-US")} سجل — صفحة {current.toLocaleString("en-US")} من{" "}
        {count.toLocaleString("en-US")}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className="table-btn" disabled={current <= 1} onClick={() => onPage(current - 1)}>
          السابق
        </button>
        {pages[0] > 1 && <span className="px-1 text-xs text-muted-foreground">…</span>}
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPage(p)}
            className={`table-btn tabular-nums ${p === current ? "!bg-primary !text-primary-foreground" : ""}`}
          >
            {p}
          </button>
        ))}
        {pages[pages.length - 1] < count && <span className="px-1 text-xs text-muted-foreground">…</span>}
        <button type="button" className="table-btn" disabled={current >= count} onClick={() => onPage(current + 1)}>
          التالي
        </button>
      </div>
    </div>
  );
}
