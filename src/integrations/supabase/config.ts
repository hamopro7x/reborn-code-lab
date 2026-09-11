export const DATABASE_PROJECT_ID = "kcdsdaytrnzoiharmyxo";
export const DATABASE_URL = `https://${DATABASE_PROJECT_ID}.supabase.co`;

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