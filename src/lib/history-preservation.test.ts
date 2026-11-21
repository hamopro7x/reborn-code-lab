import { expect, it, vi } from "vitest";
const dbAccess = vi.hoisted(() => vi.fn(() => { throw new Error("No historical data access allowed"); }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: dbAccess } }));
import { runCyclePurge, runCyclePurgeSafe } from "./monthly-cycle.server";
import { enforceRetention, enforceRetentionSafe } from "./retention.server";

it("never deletes Bybit history at a cycle rollover, even for legacy forced callers", async () => {
  const result = await runCyclePurge(true, Date.parse("2026-11-30T00:00:00Z"));
  await runCyclePurgeSafe();
  expect(result.ran).toBe(false);
  expect(result.deleted).toEqual({ bybit_card_txns: 0, bybit_ledger: 0, card_transactions: 0 });
  expect(dbAccess).not.toHaveBeenCalled();
});
it("never deletes employee history at row-count thresholds", async () => {
  for (const table of ["work_manual_txns", "work_manual_card_txns", "work_txn_assignments"]) {
    expect(await enforceRetention(table, { maxRecords: 0, deleteCount: 100 })).toEqual({ table, total: 0, deleted: 0, triggered: false });
    await enforceRetentionSafe(table);
  }
  expect(dbAccess).not.toHaveBeenCalled();
});