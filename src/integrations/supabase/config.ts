export const DATABASE_PROJECT_ID = "kcdsdaytrnzoiharmyxo";
export const DATABASE_URL = `https://${DATABASE_PROJECT_ID}.supabase.co`;
// Publishable keys are intentionally safe for browser bundles. Keeping the
// current project's value here lets previews work when host build variables
// are unavailable; privileged access still requires a server-only secret.
export const DATABASE_PUBLISHABLE_KEY = "sb_publishable_RTmbXinMhCr9B3oNa6dqqg_iVsKBKG6";

export function requireCurrentDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("Missing database URL.");
  }

  const normalized = value.replace(/\/$/, "");
  if (normalized !== DATABASE_URL) {
    throw new Error("Refusing to connect to an unexpected database project.");
  }

  return normalized;
}