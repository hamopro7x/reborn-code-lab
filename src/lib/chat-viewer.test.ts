import { describe, expect, it } from "vitest";
import { chatImageAttachments, viewerIndex, viewerKeyAction, viewerStep } from "./chat-viewer";
import type { ChatAttachment } from "./chat-rules";

const file = (id: string, mime: string, url?: string): ChatAttachment => ({ id, name: `${id}.${mime.split("/")[1]}`, mime, size: 10, url });

describe("in-site picture viewer", () => {
  it("keeps only pictures that actually have a url, in message order", () => {
    const images = chatImageAttachments([
      file("a", "image/png", "https://cdn/a.png"),
      file("b", "video/mp4", "https://cdn/b.mp4"),
      file("c", "audio/webm", "https://cdn/c.webm"),
      file("d", "image/jpeg"),
      file("e", "image/webp", "https://cdn/e.webp"),
      file("f", "application/pdf", "https://cdn/f.pdf"),
    ]);
    expect(images.map((image) => image.id)).toEqual(["a", "e"]);
  });

  it("opens the tapped picture and refuses an empty album", () => {
    expect(viewerIndex(2, 5)).toBe(2);
    expect(viewerIndex(9, 5)).toBe(4);
    expect(viewerIndex(-3, 5)).toBe(0);
    expect(viewerIndex(0, 0)).toBe(-1);
  });

  it("wraps at both ends and stays put on a single picture", () => {
    expect(viewerStep(0, 3, 1)).toBe(1);
    expect(viewerStep(2, 3, 1)).toBe(0);
    expect(viewerStep(0, 3, -1)).toBe(2);
    expect(viewerStep(0, 1, 1)).toBe(0);
    expect(viewerStep(0, 1, -1)).toBe(0);
  });

  it("closes on Escape and moves with the arrow keys only", () => {
    expect(viewerKeyAction("Escape")).toBe("close");
    expect(viewerKeyAction("ArrowRight")).toBe("prev");
    expect(viewerKeyAction("ArrowLeft")).toBe("next");
    expect(viewerKeyAction(" ")).toBeNull();
    expect(viewerKeyAction("Enter")).toBeNull();
  });
});
