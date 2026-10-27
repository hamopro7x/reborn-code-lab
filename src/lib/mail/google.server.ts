// Google OAuth + Gmail API calls per linked mailbox. Server only.
import { decryptSecret, encryptSecret } from "./crypto.server";

export const GMAIL_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export function oauthConfig() {
  const clientId = process.env["GOOGLE_OAUTH_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"];
  const redirectUri = process.env["GOOGLE_OAUTH_REDIRECT_URI"];
  if (!clientId || !clientSecret || !redirectUri) throw new Error("إعدادات Google OAuth غير مضبوطة على السيرفر");
  return { clientId, clientSecret, redirectUri };
}

export function authUrl(state: string, codeChallenge: string) {
  const { clientId, redirectUri } = oauthConfig();
  const p = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code",
    scope: GMAIL_SCOPES.join(" "), access_type: "offline", prompt: "consent select_account",
    include_granted_scopes: "false", state, code_challenge: codeChallenge, code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(code: string, codeVerifier: string) {
  const { clientId, clientSecret, redirectUri } = oauthConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: codeVerifier }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`token_exchange_failed: ${j.error ?? res.status}`);
  return j as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
}

export async function verifiedIdentity(accessToken: string) {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.email || j.email_verified !== true) throw new Error("البريد غير موثّق لدى Google");
  return { email: String(j.email).toLowerCase(), name: j.name ? String(j.name) : null };
}

export async function revokeToken(token: string) {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {}
}

export class ReauthError extends Error {}

/** Returns a valid access token, refreshing and persisting it encrypted when needed. */
export async function accessTokenFor(admin: any, accountId: string): Promise<string> {
  const { data: s } = await admin.from("mail_account_secrets").select("*").eq("account_id", accountId).maybeSingle();
  if (!s) throw new ReauthError("لا توجد بيانات اعتماد");
  if (s.access_token_ciphertext && s.access_expires_at && new Date(s.access_expires_at).getTime() > Date.now() + 60_000) {
    return decryptSecret(s.access_token_ciphertext);
  }
  const { clientId, clientSecret } = oauthConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: await decryptSecret(s.refresh_token_ciphertext) }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (j.error === "invalid_grant") throw new ReauthError("انتهت صلاحية الربط، أعد ربط الحساب");
    throw new Error(`token_refresh_failed: ${j.error ?? res.status}`);
  }
  await admin.from("mail_account_secrets").update({
    access_token_ciphertext: await encryptSecret(j.access_token),
    access_expires_at: new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("account_id", accountId);
  return j.access_token;
}

export class GmailHttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

export async function gmail(token: string, path: string, init?: RequestInit): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${GMAIL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    if (res.ok) return res.status === 204 ? null : res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1) ** 2));
      continue;
    }
    // Log status only — never bodies (may contain mail content).
    console.error(`Gmail API ${res.status} on ${path.split("?")[0].replace(/\/[A-Za-z0-9_-]{10,}/g, "/:id")}`);
    throw new GmailHttpError(res.status, `Gmail error [${res.status}]`);
  }
  throw new GmailHttpError(500, "Gmail error");
}
