/**
 * Pure value-normalization helpers shared by Bybit archive and ledger writes.
 * Kept independent of sync/persistence modules to avoid circular imports.
 */
export function sameStoredValue(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const sa = String(a), sb = String(b);
  if (sa === sb) return true;
  // Postgres returns "+00:00" / numeric text; the client sends ISO "Z" / numbers.
  const isTs = (s: string) => /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s);
  if (isTs(sa) && isTs(sb)) {
    const ta = Date.parse(sa.replace(" ", "T")), tb = Date.parse(sb.replace(" ", "T"));
    if (Number.isFinite(ta) && ta === tb) return true;
  }
  const na = Number(sa), nb = Number(sb);
  if (sa.trim() !== "" && sb.trim() !== "" && Number.isFinite(na) && na === nb) return true;
  return false;
}

export const detailText = (v: unknown) => v == null ? null : String(v);
