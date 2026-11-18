import { describe, expect, it } from "vitest";
import { allChatEmployeeIds, mentionsAllChatEmployees, canAcknowledgeChatMessage, canEditChatMessage, canOpenChatSettings, CHAT_MAX_BYTES, chatLinks, validateChatFile, type ChatMessage, type ChatState } from "./chat-rules";
describe("chat attachment and edit rules", () => {
  it("shows group settings only to the principal owner, never employees or other admins", () => {
    expect(canOpenChatSettings({ role: "employee", owner: false })).toBe(false);
    expect(canOpenChatSettings({ role: "admin", owner: false })).toBe(false);
    expect(canOpenChatSettings({ role: "admin", owner: true })).toBe(true);
  });
  it("allows confirmation only on an employee's pending undeleted message inside the group", () => {
    const message: ChatMessage = { id: "required", sender_id: "owner", sender_name: "المالك", body: "رسالة", created_at: "2026-11-17T21:00:00Z", edited_at: null, mandatory: true, deleted_at: null, attachments: [], mentions: [], poll: null, votes: [] };
    const state: ChatState = { enabled: true, userId: "employee", role: "employee", owner: false, open: true, members: [], pending: [message], notifications: [] };
    expect(canAcknowledgeChatMessage(message, state)).toBe(true);
    expect(canAcknowledgeChatMessage(message, { ...state, pending: [] })).toBe(false);
    expect(canAcknowledgeChatMessage(message, { ...state, role: "admin" })).toBe(false);
    expect(canAcknowledgeChatMessage({ ...message, deleted_at: "2026-11-17T21:30:00Z" }, state)).toBe(false);
  });
  it("groups the complete employee mention set but keeps individual mentions separate", () => {
    const members = [
      { id: "a", name: "أحمد", role: "employee" },
      { id: "b", name: "محمد", role: "employee" },
      { id: "owner", name: "المالك", role: "admin" },
    ];
    expect(mentionsAllChatEmployees(["b", "a"], members)).toBe(true);
    expect(mentionsAllChatEmployees(["a"], members)).toBe(false);
    expect(mentionsAllChatEmployees([], members)).toBe(false);
    expect(mentionsAllChatEmployees(["a", "b", "unknown"], members)).toBe(false);
    expect(mentionsAllChatEmployees([], [])).toBe(false);
  });
  it("selects all employees for mandatory reading without admins or duplicate recipients", () => {
    expect(allChatEmployeeIds([
      { id: "employee-1", name: "أحمد", role: "employee" },
      { id: "employee-2", name: "محمد", role: "employee" },
      { id: "employee-1", name: "أحمد", role: "employee" },
      { id: "owner", name: "المالك", role: "admin" },
      { id: "owner", name: "المالك", role: "employee" },
      { id: "customer", name: "عميل", role: "customer" },
    ])).toEqual(["employee-1", "employee-2"]);
  });
  it("permits own-message edits up to one hour and rejects after it", () => {
    expect(canEditChatMessage("a", "a", "2026-11-16T20:00:00Z", Date.parse("2026-11-16T21:00:00Z"))).toBe(true);
    expect(canEditChatMessage("a", "a", "2026-11-16T20:00:00Z", Date.parse("2026-11-16T21:00:00.001Z"))).toBe(false);
  });
  it("rejects editing another person's message even as owner", () => {
    expect(canEditChatMessage("employee", "owner", "2026-11-16T20:00:00Z", Date.parse("2026-11-16T20:30:00Z"))).toBe(false);
  });
  it("validates actual media signatures not only filename", () => {
    expect(validateChatFile("a.png", "image/png", new Uint8Array([137,80,78,71,13,10,26,10])).inline).toBe(true);
    expect(() => validateChatFile("a.png", "image/png", new TextEncoder().encode("not a png"))).toThrow();
    expect(validateChatFile("a.png", "text/plain", new Uint8Array([137,80,78,71])).inline).toBe(false);
  });
  it("accepts any file format only as an inert download when not supported for preview", () => {
    for (const [name, type, body] of [["a.exe", "application/octet-stream", "MZ"], ["a.html", "text/html", "<script>alert(1)</script>"], ["a.svg", "image/svg+xml", "<svg />"], ["a.ps1", "", "Write-Host hello"], ["backup.7z", "application/x-7z-compressed", "archive"], ["no-extension", "", "data"]]) {
      expect(validateChatFile(name ?? "", type ?? "", new TextEncoder().encode(body))).toMatchObject({ inline: false, mime: "application/octet-stream" });
    }
  });
  it("enforces actual size limit and serves documents download-only", () => {
    expect(() => validateChatFile("a.txt","text/plain",new Uint8Array(CHAT_MAX_BYTES+1))).toThrow();
    expect(() => validateChatFile("a.txt","text/plain",new Uint8Array())).toThrow();
    expect(validateChatFile("a.pdf","application/pdf",new TextEncoder().encode("%PDF-1.7")).inline).toBe(false);
    expect(validateChatFile("a.csv","text/csv",new TextEncoder().encode("name,value\na,2")).inline).toBe(false);
  });
  it("opens HTTP links but never javascript or HTML markup", () => {
    expect(chatLinks("https://example.com javascript:alert(1) <script>" ).filter((p) => p.url).map((p) => p.url)).toEqual(["https://example.com"]);
  });
});