import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ensureDeviceChecked, getCachedDeviceOk, resetDeviceCache } from "./device-session";

vi.mock("./device", () => ({
  getDeviceFingerprint: async () => "current-device",
  getDeviceSignature: async () => "hardware-signature",
  getLegacyDeviceFingerprint: async () => "legacy-device",
}));

beforeEach(() => {
  resetDeviceCache();
  vi.stubGlobal("navigator", { userAgent: "test-browser" });
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("recovers from a role API 500 without recording a device rejection", async () => {
  const check = vi.fn()
    .mockRejectedValueOnce(new Error("تعذّر قراءة صلاحية الحساب: Internal server error"))
    .mockResolvedValue({ ok: true });
  const pending = ensureDeviceChecked(check);
  await vi.runAllTimersAsync();
  expect(await pending).toEqual({ ok: true, fingerprint: "current-device" });
  expect(check).toHaveBeenCalledTimes(2);
  expect(getCachedDeviceOk()).toBe(true);
});

it("limits outage retries and lets the next check recover instead of caching failure", async () => {
  const check = vi.fn().mockRejectedValue(new Error("Internal server error"));
  const pending = ensureDeviceChecked(check);
  await vi.runAllTimersAsync();
  expect((await pending).error).toBe("Internal server error");
  expect(check).toHaveBeenCalledTimes(3);
  expect(getCachedDeviceOk()).toBeNull();
  check.mockResolvedValue({ ok: true });
  expect((await ensureDeviceChecked(check)).ok).toBe(true);
  expect(check).toHaveBeenCalledTimes(4);
});

it("does not retry or bypass a confirmed unauthorized employee device", async () => {
  const check = vi.fn().mockResolvedValue({ ok: false, blocked: true });
  expect(await ensureDeviceChecked(check)).toEqual({ ok: false, fingerprint: "current-device" });
  expect(getCachedDeviceOk()).toBe(false);
  await ensureDeviceChecked(check);
  expect(check).toHaveBeenCalledTimes(1);
});

it("keeps concurrent gate checks single-flight", async () => {
  const check = vi.fn().mockResolvedValue({ ok: true });
  const first = ensureDeviceChecked(check);
  const second = ensureDeviceChecked(check);
  expect(first).toBe(second);
  await first;
  expect(check).toHaveBeenCalledTimes(1);
});

it("does not interpret an incomplete response as an authorization rejection", async () => {
  const check = vi.fn().mockResolvedValue({});
  expect((await ensureDeviceChecked(check)).error).toBe("تعذّر التحقق من الجهاز");
  expect(getCachedDeviceOk()).toBeNull();
});