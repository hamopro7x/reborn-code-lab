import { describe, expect, it } from "vitest";
import { parseChatReadCursor, unreadChatMessages } from "./chat-unread";
import type { ChatMessage } from "./chat-rules";

const row = (id: string, sender_id = "other", deleted_at: string | null = null): ChatMessage => ({
  id, sender_id, deleted_at, created_at: "2026-11-17T20:00:00Z", sender_name: "موظف", body: "رسالة",
  edited_at: null, mandatory: false, attachments: [], mentions: [], poll: null, votes: [],
});
describe("chat unread boundary", () => {
  it("counts only incoming undeleted messages after the saved boundary", () => {
    expect(unreadChatMessages([row("a"), row("b"), row("c", "me"), row("d", "other", "2026-11-17T20:01:00Z"), row("e")], "me", { date: "2026-11-17T20:00:00Z", id: "a" }).map((m) => m.id)).toEqual(["b", "e"]);
  });
  it("does not invent unread history without a saved cursor", () => {
    expect(unreadChatMessages([row("a")], "me", null)).toEqual([]);
  });
  it("restores valid cursors but rejects broken storage", () => {
    expect(parseChatReadCursor('{"date":"2026-11-17T20:00:00Z","id":"a"}')).toEqual({ date: "2026-11-17T20:00:00Z", id: "a" });
    expect(parseChatReadCursor('{"date":"bad","id":"a"}')).toBeNull();
    expect(parseChatReadCursor('broken')).toBeNull();
  });
});