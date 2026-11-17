import { describe, expect, it, vi } from "vitest";
import { sendChatRecording } from "./chat-recording";

describe("recording arrow sends immediately", () => {
  it("uploads and sends once without staging the recording below the composer", async () => {
    const file = new File(["voice"], "voice.webm", { type: "audio/webm" });
    const attachment = { id: "recording-id" };
    const upload = vi.fn(async () => attachment);
    const send = vi.fn(async () => true);
    const preserve = vi.fn();
    await sendChatRecording(file, upload, send, preserve);
    expect(upload).toHaveBeenCalledExactlyOnceWith(file);
    expect(send).toHaveBeenCalledExactlyOnceWith(attachment);
    expect(preserve).not.toHaveBeenCalled();
  });
  it("keeps the uploaded recording for an explicit retry if sending fails", async () => {
    const attachment = { id: "retry-id" };
    const preserve = vi.fn();
    await sendChatRecording(new File(["voice"], "voice.webm"), async () => attachment, async () => false, preserve);
    expect(preserve).toHaveBeenCalledExactlyOnceWith(attachment);
  });
  it("never sends when the upload fails", async () => {
    const send = vi.fn();
    await expect(sendChatRecording(new File(["voice"], "voice.webm"), async () => { throw new Error("upload failed"); }, send, vi.fn())).rejects.toThrow("upload failed");
    expect(send).not.toHaveBeenCalled();
  });
});