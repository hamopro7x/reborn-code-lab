// AES-256-GCM for OAuth tokens at rest. Key: MAIL_TOKEN_ENCRYPTION_KEY (base64, 32 bytes). Server only.
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function key() {
  const raw = process.env["MAIL_TOKEN_ENCRYPTION_KEY"];
  if (!raw) throw new Error("MAIL_TOKEN_ENCRYPTION_KEY is not set");
  const bytes = unb64(raw);
  if (bytes.length !== 32) throw new Error("MAIL_TOKEN_ENCRYPTION_KEY must be 32 bytes base64");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(plain)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return "v1:" + b64(out);
}

export async function decryptSecret(stored: string): Promise<string> {
  const buf = unb64(stored.replace(/^v1:/, ""));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(0, 12) }, await key(), buf.subarray(12));
  return dec.decode(pt);
}

export async function sha256Hex(s: string) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32) {
  return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
