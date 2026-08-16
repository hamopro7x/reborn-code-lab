import { useEffect, useRef, useState } from "react";

/**
 * Tracks whether the browser is unloading the document (refresh / close / hard
 * navigation). Used to tell a real page refresh apart from the user simply
 * leaving a section inside the app.
 */
let unloading = false;
if (typeof window !== "undefined") {
  const markUnloading = () => {
    unloading = true;
  };
  window.addEventListener("beforeunload", markUnloading);
  window.addEventListener("pagehide", markUnloading);
}

/**
 * useState that survives a page refresh (per browser, per key), but resets when
 * the user leaves the section and comes back — so every section always opens
 * from its starting point.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const storageKey = `mp:${key}`;
  const [value, setValue] = useState<T>(initial);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore */
    }
    hydrated.current = true;

    return () => {
      // Unmount without a document unload = the user navigated away from this
      // section. Drop the saved step so re-entering starts from the beginning.
      if (unloading) return;
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    };
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [storageKey, value]);

  return [value, setValue] as const;
}
