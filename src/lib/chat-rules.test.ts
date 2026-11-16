import { describe, expect, it } from "vitest";
import { canEditChatMessage, CHAT_MAX_BYTES, chatLinks, validateChatFile } from "./chat-rules";
describe("chat attachment and edit rules", () => {
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
    expect(() => validateChatFile("a.png", "text/plain", new Uint8Array([137,80,78,71]))).toThrow();
  });
  it("rejects executable, HTML, SVG and shell uploads", () => {
    for (const [name,type,body] of [["a.exe","application/octet-stream","MZ"],["a.txt","text/plain","MZpayload"],["a.txt","text/plain","<script>alert(1)</script>"],["a.txt","text/plain","#!/bin/sh"],["a.svg","image/svg+xml","<svg />"]]) {
      expect(() => validateChatFile(name ?? "",type ?? "",new TextEncoder().encode(body))).toThrow();
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