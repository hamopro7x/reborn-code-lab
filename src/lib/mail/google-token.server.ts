// Server-side access-token lifecycle. Refreshed credentials are encrypted before persistence.
import { decryptSecret, encryptSecret } from "./crypto.server";
import { oauthConfig } from "./google-oauth.server";

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
