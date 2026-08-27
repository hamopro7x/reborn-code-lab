/**
 * تذكّر آخر مكان كان فيه المستخدم (المسار + الـ query) على مستوى الموقع كله:
 * الأدمن، الموظف، وواجهة المستخدم.
 *
 * الفائدة: أي تحديث للصفحة (F5) أو إعادة تسجيل دخول يرجّع المستخدم لنفس
 * القسم/الصفحة التي كان فيها — ولا يقذفه للرئيسية أو لقسم آخر.
 */

const KEY = "lastLocation";

/** لا نحفظ صفحات لا معنى للرجوع إليها. */
function isRestorable(url: string) {
  if (!url.startsWith("/")) return false;
  return !/^\/(auth|api|\.well-known|\.mcp)/.test(url);
}

export function saveLastLocation(url: string) {
  try {
    if (typeof window === "undefined") return;
    if (!isRestorable(url)) return;
    window.localStorage.setItem(KEY, url);
  } catch {
    /* تجاهل */
  }
}

export function readLastLocation(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const url = window.localStorage.getItem(KEY);
    if (!url || !isRestorable(url)) return null;
    return url;
  } catch {
    return null;
  }
}

export function clearLastLocation() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* تجاهل */
  }
}
