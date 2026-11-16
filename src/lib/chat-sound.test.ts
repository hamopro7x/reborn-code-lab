import { describe, expect, it } from "vitest";
import { isNewIncomingChat } from "./chat-sound";

describe("incoming chat sound cursor", () => {
  const first = { id: "a", created_at: "2026-11-16T23:00:00Z" };
  it("sounds for a new received message after an empty baseline", () => {
    expect(isNewIncomingChat(null, first)).toBe(true);
  });
  it("does not repeat for edits, read confirmations or polls with the same incoming message", () => {
    expect(isNewIncomingChat(first, { ...first })).toBe(false);
  });
  it("sounds for later arrivals including the same timestamp cursor", () => {
    expect(isNewIncomingChat(first, { id: "b", created_at: first.created_at })).toBe(true);
    expect(isNewIncomingChat(first, { id: "c", created_at: "2026-11-16T23:01:00Z" })).toBe(true);
  });
  it("does not sound when deletion restores an older message or empties the chat", () => {
    expect(isNewIncomingChat(first, { id: "z", created_at: "2026-11-16T22:00:00Z" })).toBe(false);
    expect(isNewIncomingChat(first, null)).toBe(false);
  });
});