import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, db } = vi.hoisted(() => {
  const query: Record<string, any> = {};
  for (const method of ["select", "eq", "order", "limit", "is", "not"]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return { query, db: { from: vi.fn(() => query) } };
});
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));
vi.mock("./retention.server", () => ({ enforceRetentionSafe: vi.fn() }));
import { shiftHistory } from "./work.server";

describe("archived employee shift history", () => {
  beforeEach(() => vi.clearAllMocks());
  it("keeps archived shifts hidden from the default list", async () => {
    await shiftHistory("employee-1");
    expect(query.is).toHaveBeenCalledWith("archived_at", null);
    expect(query.not).not.toHaveBeenCalled();
  });
  it("reads archived shifts in the explicit archived view without changing them", async () => {
    await shiftHistory("employee-1", 100, true);
    expect(query.not).toHaveBeenCalledWith("archived_at", "is", null);
    expect(query.is).not.toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith("user_id", "employee-1");
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.from).toHaveBeenCalledWith("work_shifts");
  });
});