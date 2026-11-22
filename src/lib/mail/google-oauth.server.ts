// Google OAuth consent, code exchange, identity verification, and token revocation.

export const GMAIL_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

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
