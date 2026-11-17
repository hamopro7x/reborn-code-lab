import { describe, expect, it } from "vitest";
import { chatReadPhase, chatRetryDelay } from "./chat-query";

describe("chat read recovery", () => {
  it("keeps confirmed messages available after a failed background refresh", () => {
    expect(chatReadPhase([{ id: "confirmed-message" }], true)).toBe("ready");
  });
  it("does not turn a failed first read into an empty conversation", () => {
    expect(chatReadPhase(undefined, true)).toBe("retrying");
    expect(chatReadPhase([], true)).toBe("ready");
  });
  it("backs off retries without exceeding five seconds", () => {
    expect([0, 1, 2, 3, 10].map(chatRetryDelay)).toEqual([1000, 2000, 4000, 5000, 5000]);
  });
});