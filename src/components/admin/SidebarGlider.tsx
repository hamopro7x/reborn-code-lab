import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * شريط مؤشر واحد (Glider) يتحرك للعنصر النشط داخل الشريط الجانبي.
 * يقيس موضع العنصر الذي يحمل data-active="true" من الـDOM، فيعمل مع أي عدد
 * عناصر (أدمن أو موظف) ويعاد حسابه تلقائيًا عند تغيّر القائمة أو المقاس.
 */
export function SidebarGlider({
  children,
  activeKey,
}: {
  children: React.ReactNode;
  activeKey?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; height: number } | null>(null);

  const measure = useCallback(() => {
    const host = ref.current;
    if (!host) return;
    const el = host.querySelector<HTMLElement>('[data-active="true"]');
    if (!el) {
      setPos(null);
      return;
    }
    const hostRect = host.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top - hostRect.top + host.scrollTop, height: rect.height });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, activeKey, children]);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    const mo = new MutationObserver(() => measure());
    mo.observe(host, { attributes: true, subtree: true, childList: true, attributeFilter: ["data-active"] });
    window.addEventListener("resize", measure);
    host.addEventListener("scroll", measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", measure);
      host.removeEventListener("scroll", measure);
    };
  }, [measure]);

  return (
    <div ref={ref} className="nav-glider-host">
      <span aria-hidden="true" className="nav-glider-track" />
      {pos && (
        <span
          aria-hidden="true"
          className="nav-glider"
          style={{ transform: `translateY(${pos.top}px)`, height: `${pos.height}px` }}
        />
      )}
      {children}
    </div>
  );
}
