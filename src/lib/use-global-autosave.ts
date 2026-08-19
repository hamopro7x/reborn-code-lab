import { useEffect } from "react";

/**
 * حفظ تلقائي عام لكل مدخلات الموقع:
 * يحفظ قيم الحقول أثناء الكتابة ويستعيدها لو حدثت الصفحة أو رجعت لها.
 */
const PREFIX = "autosave:";
const SKIP = /password|token|secret|cvc|cvv|otp|code/i;

const keyOf = (el: HTMLInputElement | HTMLTextAreaElement) => {
  const name = el.name || el.id;
  if (!name) return null;
  return `${PREFIX}${window.location.pathname}::${name}`;
};

const isSaveable = (el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement => {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
  if (el instanceof HTMLInputElement) {
    if (["password", "file", "hidden", "checkbox", "radio", "submit"].includes(el.type)) return false;
  }
  const name = el.name || el.id;
  if (!name || SKIP.test(name) || el.dataset["noAutosave"] !== undefined) return false;
  return true;
};

export function useGlobalAutoSave() {
  useEffect(() => {
    const onInput = (e: Event) => {
      const el = e.target;
      if (!isSaveable(el)) return;
      const key = keyOf(el);
      if (!key) return;
      try {
        if (el.value) localStorage.setItem(key, el.value);
        else localStorage.removeItem(key);
      } catch {
        /* ignore quota */
      }
    };

    const restoreElement = (el: HTMLInputElement | HTMLTextAreaElement) => {
        if (el.dataset["autosaveChecked"] !== undefined) return;
        el.dataset["autosaveChecked"] = "";
        if (!isSaveable(el) || el.value) return;
        const key = keyOf(el);
        if (!key) return;
        const saved = localStorage.getItem(key);
        if (!saved) return;
        el.value = saved;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    };

    const restoreWithin = (node: Node) => {
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
        restoreElement(node);
      }
      if (!(node instanceof Element)) return;
      node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea").forEach(restoreElement);
    };

    const onSubmit = (e: Event) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea").forEach((el) => {
        const key = keyOf(el);
        if (key) localStorage.removeItem(key);
      });
    };

    document.addEventListener("input", onInput, true);
    document.addEventListener("submit", onSubmit, true);
    const t = window.setTimeout(() => restoreWithin(document.body), 400);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(restoreWithin);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("submit", onSubmit, true);
      window.clearTimeout(t);
      observer.disconnect();
    };
  }, []);
}
