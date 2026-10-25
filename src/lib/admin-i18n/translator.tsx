import { useEffect, useState } from "react";
import { Languages } from "lucide-react";
import EN from "./en.json";

/**
 * ترجمة لوحة الإدارة للإنجليزي على مستوى العرض فقط: تستبدل النصوص الظاهرة
 * من القاموس وترجعها للأصل عند العودة للعربي. لا تغيّر الاتجاه ولا البيانات.
 */
export type AdminLang = "ar" | "en";
const KEY = "mg-pro-admin-lang";
const DICT = EN as Record<string, string>;
const ATTRS = ["placeholder", "title", "aria-label"] as const;
const AR = /[\u0600-\u06FF]/;
// مفاتيح طويلة أولًا للاستبدال الجزئي داخل نص فيه قيم متغيرة.
const PARTIAL = Object.keys(DICT)
  .filter((k) => k.length >= 3)
  .sort((a, b) => b.length - a.length);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PARTIAL_RE = PARTIAL.length
  ? new RegExp(`(?<![\\u0621-\\u064A])(?:${PARTIAL.map(esc).join("|")})(?![\\u0621-\\u064A])`, "g")
  : null;

export function translateText(text: string): string {
  if (!AR.test(text)) return text;
  const norm = text.replace(/\s+/g, " ").trim();
  const exact = DICT[norm];
  if (exact !== undefined) {
    const lead = text.match(/^\s*/)?.[0] ?? "";
    const trail = text.match(/\s*$/)?.[0] ?? "";
    return lead + exact + trail;
  }
  return PARTIAL_RE ? text.replace(PARTIAL_RE, (m) => DICT[m] ?? m) : text;
}

const origText = new WeakMap<Text, { src: string; out: string }>();
const origAttr = new WeakMap<Element, Record<string, { src: string; out: string }>>();

function applyNode(node: Node, lang: AdminLang) {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node as Text;
    const rec = origText.get(t);
    const cur = t.data;
    // لو React غيّر النص بعد ترجمته نعتبر الجديد هو الأصل.
    const src = rec && rec.out === cur ? rec.src : cur;
    const out = lang === "en" ? translateText(src) : src;
    if (out !== cur) t.data = out;
    if (src !== out) origText.set(t, { src, out });
    else origText.delete(t);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName;
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA") return;
  const recs = origAttr.get(el) ?? {};
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (cur == null) continue;
    const r = recs[a];
    const src = r && r.out === cur ? r.src : cur;
    const out = lang === "en" ? translateText(src) : src;
    if (out !== cur) el.setAttribute(a, out);
    recs[a] = { src, out };
  }
  origAttr.set(el, recs);
  if (tag === "INPUT") return;
  el.childNodes.forEach((c) => applyNode(c, lang));
}

export function useAdminLang() {
  const [lang, setLang] = useState<AdminLang>("ar");
  useEffect(() => {
    if (localStorage.getItem(KEY) === "en") setLang("en");
  }, []);
  const change = (l: AdminLang) => {
    setLang(l);
    localStorage.setItem(KEY, l);
  };
  return [lang, change] as const;
}

/** يراقب الصفحة (بما فيها النوافذ المنبثقة) ويطبّق اللغة المختارة. */
export function AdminTranslator({ lang }: { lang: AdminLang }) {
  useEffect(() => {
    const root = document.body;
    applyNode(root, lang);
    if (lang !== "en") return;
    let busy = false;
    const obs = new MutationObserver((muts) => {
      if (busy) return;
      busy = true;
      for (const m of muts) {
        if (m.type === "characterData") applyNode(m.target, lang);
        else if (m.type === "attributes") applyNode(m.target, lang);
        else m.addedNodes.forEach((n) => applyNode(n, lang));
      }
      obs.takeRecords();
      busy = false;
    });
    obs.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    });
    return () => {
      obs.disconnect();
      applyNode(root, "ar");
    };
  }, [lang]);
  return null;
}

export function AdminLangToggle({ lang, onChange }: { lang: AdminLang; onChange: (l: AdminLang) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(lang === "en" ? "ar" : "en")}
      className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
      aria-label={lang === "en" ? "العربية" : "English"}
      data-no-translate
    >
      <Languages className="size-3.5" />
      {lang === "en" ? "ع" : "EN"}
    </button>
  );
}
