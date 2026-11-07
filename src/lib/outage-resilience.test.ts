import { describe, expect, it, vi } from "vitest";
import { pollDelay } from "./live-poll";
import { reconcileDue } from "./mail/sync.server";
import { withRequestTimeout } from "@/integrations/supabase/timeout-fetch";

describe("screen polling while the database fails", () => {
  it("keeps the normal 5 second refresh when requests succeed", () => {
    expect(pollDelay(5_000, 0)).toBe(5_000);
  });

  it("slows down after failures and never waits more than one minute", () => {
    expect(pollDelay(5_000, 1)).toBe(10_000);
    expect(pollDelay(5_000, 2)).toBe(20_000);
    expect(pollDelay(5_000, 10)).toBe(60_000);
  });
});

describe("mail deletion check", () => {
  it("runs at most once per minute per account", () => {
    const now = Date.UTC(2026, 10, 7, 17, 0, 30);
    expect(reconcileDue(new Date(Date.UTC(2026, 10, 7, 17, 0, 5)).toISOString(), now)).toBe(false);
    expect(reconcileDue(new Date(Date.UTC(2026, 10, 7, 16, 59, 55)).toISOString(), now)).toBe(true);
    expect(reconcileDue(null, now)).toBe(true);
  });
});

describe("database request deadline", () => {
  it("aborts a database call that never answers", async () => {
    vi.useFakeTimers();
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    const call = withRequestTimeout(hanging, 20_000)("https://db.example/rest/v1/orders");
    const check = expect(call).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(20_000);
    await check;
    vi.useRealTimers();
  });

  it("does not put a deadline on file uploads", async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    const spy: typeof fetch = async (_input, init) => {
      seen.push(init?.signal);
      return new Response("ok");
    };
    await withRequestTimeout(spy, 20_000)("https://db.example/storage/v1/object/files/a.exe");
    expect(seen[0]).toBeUndefined();
  });
});
