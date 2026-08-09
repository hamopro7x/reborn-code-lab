// Client-side device fingerprint.
// Combines a persistent UUID stored in localStorage with a stable browser signature.
// Hashed together so it fits in a short opaque string.

const STORAGE_KEY = "mag_device_id_v1";

function getPersistentId(): string {
  try {
    let v = localStorage.getItem(STORAGE_KEY);
    if (!v) {
      v = (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem(STORAGE_KEY, v);
    }
    return v;
  } catch {
    return "no-storage";
  }
}

function canvasSignal(): string {
  try {
    const c = document.createElement("canvas");
    c.width = 200; c.height = 40;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 60, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("mag-device-fp", 2, 2);
    return c.toDataURL().slice(-64);
  } catch { return ""; }
}

async function sha256Hex(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "ssr";
  // Stable per browser profile: depends ONLY on the persistent id, so browser
  // updates / window resizes / account switches never change it.
  return await sha256Hex("mag-fp-v2|" + getPersistentId());
}

/**
 * Hardware-level signature: identical across browser profiles and Google
 * accounts on the SAME physical machine (no localStorage, no UA version,
 * no canvas noise). Used to inherit approval for a new profile/account.
 */
export async function getDeviceSignature(): Promise<string> {
  if (typeof window === "undefined") return "ssr";
  const nav = navigator as any;
  const platform = /Windows/i.test(nav.userAgent) ? "Windows"
    : /Mac OS/i.test(nav.userAgent) ? "macOS"
    : /Android/i.test(nav.userAgent) ? "Android"
    : /iPhone|iPad/i.test(nav.userAgent) ? "iOS"
    : /Linux/i.test(nav.userAgent) ? "Linux" : "Other";
  const parts = [
    "mag-hw-v1",
    platform,
    nav.platform ?? "",
    nav.hardwareConcurrency ?? "",
    nav.deviceMemory ?? "",
    screen.width + "x" + screen.height + "x" + screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    (nav.language || "").split("-")[0],
    canvasSignal(),
  ].join("|");
  return await sha256Hex(parts);
}


export function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  const platform = /iPhone|iPad/i.test(ua) ? "iOS" :
    /Android/i.test(ua) ? "Android" :
    /Windows/i.test(ua) ? "Windows" :
    /Mac OS/i.test(ua) ? "macOS" :
    /Linux/i.test(ua) ? "Linux" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${platform} • ${browser}`;
}
/**
 * Legacy (v1) fingerprint — kept so devices approved before the stable v2
 * algorithm keep working; when matched, the server migrates the row.
 */
export async function getLegacyDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "ssr";
  const nav = navigator as any;
  const parts = [
    getPersistentId(),
    nav.userAgent,
    nav.language,
    nav.platform,
    nav.hardwareConcurrency ?? "",
    nav.deviceMemory ?? "",
    screen.width + "x" + screen.height + "x" + screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    canvasSignal(),
  ].join("|");
  return await sha256Hex(parts);
}
