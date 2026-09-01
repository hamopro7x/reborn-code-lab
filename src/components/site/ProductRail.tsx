import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * شريط أفقي قابل للتمرير داخل القسم نفسه فقط (لا يحرّك الصفحة).
 * يعمل بالسحب على الموبايل وبالأزرار على الشاشات الكبيرة.
 */
export function ProductRail({
  children,
  itemClassName = "w-[36%] sm:w-[24%] md:w-[19%] xl:w-[14%]",
  ariaLabel,
}: {
  children: React.ReactNode[];
  itemClassName?: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // في RTL تكون قيم scrollLeft سالبة أو موجبة حسب المتصفح.
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    setAtStart(pos < 8);
    setAtEnd(pos > max - 8);
  }, []);

  useEffect(() => {
    sync();
  }, [sync, children.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" });
  };

  const arrow =
    "absolute top-1/2 -translate-y-1/2 z-10 size-9 rounded-full border border-border bg-card text-card-foreground flex items-center justify-center transition-colors duration-150 hover:bg-primary hover:text-primary-foreground disabled:opacity-0";

  return (
    <div className="relative" aria-label={ariaLabel}>
      <button
        type="button"
        onClick={() => scrollBy(1)}
        disabled={atStart}
        aria-label="السابق"
        className={`${arrow} -right-2 sm:right-0`}
      >
        <ChevronRight className="size-4" />
      </button>

      <ul
        ref={ref}
        onScroll={sync}
        className="flex gap-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory scroll-smooth"
      >
        {children.map((child, i) => (
          <li key={i} className={`shrink-0 snap-start min-w-0 ${itemClassName}`}>
            {child}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => scrollBy(-1)}
        disabled={atEnd}
        aria-label="التالي"
        className={`${arrow} -left-2 sm:left-0`}
      >
        <ChevronLeft className="size-4" />
      </button>
    </div>
  );
}
