/** Historical staff records are archival: row-count thresholds never authorize deletion. */
export const RETENTION_TABLES = {
  work_manual_txns: { table: "work_manual_txns" },
  work_manual_card_txns: { table: "work_manual_card_txns" },
  work_txn_assignments: { table: "work_txn_assignments" },
};
export type RetentionResult = { table: string; total: number; deleted: number; triggered: boolean };
/** Compatibility for existing callers; no database reads, writes or maintenance delays. */
export async function enforceRetention(
  key: string,
  _overrides?: { maxRecords?: number; deleteCount?: number },
): Promise<RetentionResult> {
  return { table: key, total: 0, deleted: 0, triggered: false };
}
export async function enforceRetentionSafe(
  _key: string,
  _overrides?: { maxRecords?: number; deleteCount?: number },
): Promise<void> {}
