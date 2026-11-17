import type { ChatMessage } from "./chat-rules";

export type ChatReadCursor = { date: string; id: string };

export function unreadChatMessages(messages: ChatMessage[], userId: string, cursor: ChatReadCursor | null) {
  if (!cursor) return [];
  return messages.filter((message) => !message.deleted_at && message.sender_id !== userId &&
    (message.created_at > cursor.date || (message.created_at === cursor.date && message.id > cursor.id)));
}

export function parseChatReadCursor(value: string | null): ChatReadCursor | null {
  try {
    const parsed = JSON.parse(value ?? "null");
    return parsed && typeof parsed.date === "string" && Number.isFinite(Date.parse(parsed.date)) && typeof parsed.id === "string"
      ? { date: parsed.date, id: parsed.id } : null;
  } catch { return null; }
}