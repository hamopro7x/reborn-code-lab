import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mirrorStoredCardRows, syncAccountRecent } from "./bybit.server";

function archive(rows: any[], error: { message: string } | null = null) {
  const scope: Record<string, any> = {};
  const q = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((key: string, value: any) => { scope[key] = value; return q; }),
    gte: vi.fn((_key: string, value: number) => { scope.start = value; return q; }),
    lt: vi.fn((_key: string, value: number) => { scope.end = value; return q; }),
    in: vi.fn(async (_key: string, ids: string[]) => ({
      error,
      data: rows.filter((r) => r.account_id === scope.account_id && r.txn_time >= scope.start && r.txn_time < scope.end && ids.includes(r.txn_id)),
    })),
  };
  return { from: vi.fn(() => q), q };
}

const row = (txn_id: string, account_id = "a", detail = { side: "1", tradeStatus: "1" }) => ({
  txn_id, account_id, detail, amount: 12, currency: "USD", txn_time: Date.parse("2026-10-29T19:00:00Z"),
  merchant: "TikTok", pan4: "1234", txn_type: detail.side, status: "success",
});

describe("immediate individual-to-central card mirror", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T19:16:00Z")); });
  afterEach(() => { vi.useRealTimers(); });
  it("mirrors persisted purchases once with the same account, amount and time", async () => {
    const db = archive([row("t")]);
    const save = vi.fn(async (rows: any[]) => rows.length);
    expect(await mirrorStoredCardRows(db, "a", ["t", "t"], save)).toBe(1);
    expect(save.mock.calls[0][0]).toMatchObject([{
      account_id: "a", ref_id: "t", kind: "card", amount: -12, status: "success", occurred_at: "2026-10-29T19:00:00.000Z",
    }]);
  });

  it("never invents ledger rows when the archive did not save them", async () => {
    const save = vi.fn(async () => 1);
    expect(await mirrorStoredCardRows(archive([]), "a", ["missing"], save)).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });

  it("does not mirror another account or any transaction before the reset", async () => {
    const db = archive([row("other", "b"), { ...row("old"), txn_time: Date.parse("2026-10-29T18:00:00Z") }, row("new")]);
    const save = vi.fn(async (rows: any[]) => rows.length);
    expect(await mirrorStoredCardRows(db, "a", ["other", "old", "new"], save)).toBe(1);
    expect(save.mock.calls[0][0].map((r: any) => r.ref_id)).toEqual(["new"]);
  });

  it("raw reversal wins over stale success in the central mirror", async () => {
    const save = vi.fn(async (rows: any[]) => rows.length);
    await mirrorStoredCardRows(archive([row("reversed", "a", { side: "2", tradeStatus: "3" })]), "a", ["reversed"], save);
    expect(save.mock.calls[0][0][0]).toMatchObject({ kind: "card", status: "reversed" });
  });

  it("keeps a real refund separate", async () => {
    const save = vi.fn(async (rows: any[]) => rows.length);
    await mirrorStoredCardRows(archive([row("refund", "a", { side: "5", tradeStatus: "1" })]), "a", ["refund"], save);
    expect(save.mock.calls[0][0][0]).toMatchObject({ kind: "refund", status: "refund", amount: 12 });
  });

  it("reports a failed archive read instead of claiming the mirror succeeded", async () => {
    const save = vi.fn(async () => 1);
    await expect(mirrorStoredCardRows(archive([], { message: "unavailable" }), "a", ["t"], save)).rejects.toThrow("mirror read failed");
    expect(save).not.toHaveBeenCalled();
  });

  it("saves the new account purchase with immediate shift assignment before resolving", async () => {
    let release: (() => void) | undefined;
    const assignment = new Promise<void>((resolve) => { release = resolve; });
    const persist = vi.fn(async () => { await assignment; return []; });
    const read = vi.fn(async () => [{
      txnId: "new-card", txnCreate: Date.parse("2026-10-29T19:00:00Z"),
      side: "1", tradeStatus: "0", basicAmount: "12", basicCurrency: "USD", merchName: "TikTok",
    }]);
    let completed = false;
    const job = syncAccountRecent("a", { read, persist }).then((count) => { completed = true; return count; });
    await vi.waitFor(() => expect(persist).toHaveBeenCalled());
    expect(persist).toHaveBeenCalledWith([expect.objectContaining({ amount: 12, detail: expect.objectContaining({ tradeStatus: "0" }) })], "a", true);
    expect(completed).toBe(false);
    release?.();
    expect(await job).toBe(1);
  });

  it("never sends a pre-reset purchase for immediate assignment", async () => {
    const persist = vi.fn(async () => []);
    await syncAccountRecent("a", {
      read: async () => [{ txnId: "old", txnCreate: Date.parse("2026-10-29T18:00:00Z"), side: "1", tradeStatus: "1" }],
      persist,
    });
    expect(persist).toHaveBeenCalledWith([], "a", true);
  });
});