import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ row: { user_id: "employee", pin_hash: "", pin_salt: "fixture", fail_count: 0, locked_until: null as string | null }, writes: 0, replacement: false, conflict: false }));
const db = {
  from: () => {
    const filters = new Map<string, unknown>();
    let patch: Record<string, unknown> | null = null;
    const query = {
      select: (_columns: string) => query,
      update: (value: Record<string, unknown>) => { patch = value; return query; },
      eq: (key: string, value: unknown) => { filters.set(key, value); return query; },
      is: (key: string, value: unknown) => { filters.set(key, value); return query; },
      maybeSingle: async () => {
        if (!patch) {
          const snapshot = { ...state.row };
          await Promise.resolve();
          return { data: snapshot, error: null };
        }
        state.writes++;
        if (state.replacement) { state.row.pin_hash = "replacement-hash"; state.replacement = false; }
        const matches = [...filters].every(([key, value]) => state.row[key as keyof typeof state.row] === value);
        if (!matches || state.conflict) return { data: null, error: null };
        state.row = { ...state.row, ...patch };
        return { data: { user_id: "employee" }, error: null };
      },
    };
    return query;
  },
};
import { verifyPinAttempt } from "./pin-attempt.server";
const verifyPin = (userId: string, pin: string) => verifyPinAttempt(db, userId, pin);
beforeEach(async () => {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("fixture:123456"));
  state.row = { user_id: "employee", pin_hash: Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(""), pin_salt: "fixture", fail_count: 0, locked_until: null };
  state.writes = 0; state.replacement = false; state.conflict = false;
});
it("counts all five simultaneous wrong PINs and locks rather than losing increments", async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () => verifyPin("employee", "000000")));
  expect(results.every((r) => r.ok === false)).toBe(true);
  expect(state.row.fail_count).toBe(5);
  expect(Date.parse(state.row.locked_until ?? "") - Date.now()).toBeGreaterThan(290_000);
  expect((await verifyPin("employee", "123456")).ok).toBe(false);
});
it("rechecks an admin PIN replacement instead of accepting a stale valid hash", async () => {
  state.replacement = true;
  expect((await verifyPin("employee", "123456")).ok).toBe(false);
  expect(state.row.pin_hash).toBe("replacement-hash");
  expect(state.row.fail_count).toBe(1);
});
it("fails closed after five conflicting writes rather than retrying indefinitely", async () => {
  state.conflict = true;
  await expect(verifyPin("employee", "123456")).rejects.toThrow("محاولات متزامنة");
  expect(state.writes).toBe(5);
  expect(state.row.fail_count).toBe(0);
});
