import type { ChatAttachment } from "@/lib/chat-rules";

/** Only real, uploadable pictures open in the in-site viewer. */
export function chatImageAttachments(attachments: ChatAttachment[] = []) {
  return attachments.filter((attachment) => !!attachment.url && attachment.mime.startsWith("image/"));
}

/** Clamp a requested index into the album; -1 means there is nothing to show. */
export function viewerIndex(index: number, total: number) {
  if (total <= 0) return -1;
  return Math.min(Math.max(index, 0), total - 1);
}

/** Step through the album and wrap around at both ends. */
export function viewerStep(current: number, total: number, direction: -1 | 1) {
  if (total <= 0) return 0;
  const next = current + direction;
  if (next < 0) return total - 1;
  if (next >= total) return 0;
  return next;
}

/** Keyboard map: Escape closes, arrows move through the album in RTL order. */
export function viewerKeyAction(key: string): "close" | "prev" | "next" | null {
  if (key === "Escape") return "close";
  if (key === "ArrowRight") return "prev";
  if (key === "ArrowLeft") return "next";
  return null;
}
