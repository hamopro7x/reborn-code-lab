// Server-only scaffold for a future TikTok integration (Login Kit / Display API).
// Nothing here is wired to any page yet. Credentials are read from server env only.
// TikTok's official API does not offer coin top-up; never add top-up logic here.

const TIKTOK_API = "https://open.tiktokapis.com/v2";

export function getTikTokConfig() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;
  if (!clientKey || !clientSecret || !redirectUri) return null;
  return { clientKey, clientSecret, redirectUri };
}

/** Only scopes approved for the app in TikTok for Developers should be requested. */
export const TIKTOK_SCOPES = ["user.info.basic"] as const;

export async function fetchTikTokUserInfo(accessToken: string) {
  const res = await fetch(`${TIKTOK_API}/user/info/?fields=open_id,display_name,avatar_url`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`TikTok request failed [${res.status}]: ${await res.text()}`);
  return res.json();
}
