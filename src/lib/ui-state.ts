import { useCallback, useEffect, useRef, useState } from "react";

/**
 * طبقة موحّدة لحفظ حالة الواجهة (UI State Persistence).
 *
 * الهدف: بعد F5 يعود المستخدم لنفس الصفحة/التبويب/البحث/الفلتر/الترتيب
 * ونفس مكان التمرير — بدون تخزين عشوائي في LocalStorage.
 *
 * المفتاح = المستخدم (Role/ID) + المسار (Route) + القسم (Section) + الاسم.
 * وبهذا لا تتداخل حالة الأدمن مع الموظف أو المستخدم على نفس الجهاز.
 *
 * التخزين في sessionStorage: يبقى بعد Refresh ويُنظّف تلقائيًا بإغلاق التبويب.
 */

const PREFIX = "uis";

let scope = "anon";

/** يحدّد صاحب الحالة (يُستدعى مرة واحدة من الجذر بعد معرفة المستخدم). */
export function setUiScope(next: string | null | undefined) {
  const value = next && next.trim() ? next.trim() : "anon";
  if (value === scope) return;
  scope = value;
}

export function getUiScope() {
  return scope;
}

function routeKey() {
  if (typeof window === "undefined") return "ssr";
  return window.location.pathname;
}

function buildKey(section: string, name: string) {
  return `${PREFIX}:${scope}:${routeKey()}:${section}:${name}`;
}

function read<T>(key: string): T | undefined {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw == null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* تجاهل حدود المساحة */
  }
}

/**
 * useState محفوظ لكل (مستخدم + مسار + قسم). يعود لنفس القيمة بعد Refresh.
 * يُستخدم لـ: currentPage, pageSize, searchTerm, filters, sort, activeTab,
 * expanded/collapsed ... إلخ.
 */
export function useUiState<T>(section: string, name: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const keyRef = useRef<string>("");
  const ready = useRef(false);

  useEffect(() => {
    const key = buildKey(section, name);
    keyRef.current = key;
    const saved = read<T>(key);
    if (saved !== undefined) setValue(saved);
    ready.current = true;
  }, [section, name]);

  useEffect(() => {
    if (!ready.current || !keyRef.current) return;
    write(keyRef.current, value);
  }, [value]);

  return [value, setValue] as const;
}

/** حفظ/استرجاع مكان التمرير للعنصر (أو الصفحة) بعد Refresh. */
export function useScrollRestore(section: string, enabled = true) {
  const keyRef = useRef<string>("");

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const key = buildKey(section, "scrollY");
    keyRef.current = key;

    const saved = read<number>(key);
    let raf = 0;
    if (typeof saved === "number" && saved > 0) {
      // ننتظر رسم المحتوى أولاً ثم نعيد التمرير.
      raf = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => window.scrollTo({ top: saved }));
      });
    }

    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        write(key, window.scrollY);
      }, 250);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      if (t) clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
      write(key, window.scrollY);
    };
  }, [section, enabled]);
}

/** مسح حالة قسم معيّن (مثلاً بعد إعادة تعيين الفلاتر). */
export function useClearUiState(section: string) {
  return useCallback(() => {
    try {
      const prefix = `${PREFIX}:${scope}:${routeKey()}:${section}:`;
      const keys: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      keys.forEach((k) => window.sessionStorage.removeItem(k));
    } catch {
      /* تجاهل */
    }
  }, [section]);
}
