export type WorkSummary = { count: number; amount: number; egp: number; entered: number };
export const emptyWorkSummary = (): WorkSummary => ({ count: 0, amount: 0, egp: 0, entered: 0 });
type Entry = { egp?: number | null; quantity?: number | null };
export function addWorkSummary(summary: WorkSummary, row: { amount?: number | null; work_txn_entries?: Entry | Entry[] | null }) {
  const value = Number(row.amount ?? 0);
  summary.count++;
  summary.amount += Number.isFinite(value) ? Math.abs(value) : 0;
  const entry = Array.isArray(row.work_txn_entries) ? row.work_txn_entries[0] : row.work_txn_entries;
  const egp = Number(entry?.egp ?? 0);
  summary.egp += Number.isFinite(egp) ? egp : 0;
  if (entry?.egp != null || entry?.quantity != null) summary.entered++;
}