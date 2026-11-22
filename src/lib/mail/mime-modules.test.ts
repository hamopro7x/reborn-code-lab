import { describe, expect, it } from "vitest";
import { b64urlToBytes, bytesToB64 } from "./mime-encoding";
import { folderFromLabels, parsePayload } from "./mime-parse";
import { buildRawMessage } from "./mime-compose";
import { extractLogoUrl, safeEmailDocument } from "./mime-sanitize";

const decodeRaw = (raw: string) => new TextDecoder().decode(b64urlToBytes(raw));

describe("isolated MIME modules", () => {
  it("round-trips UTF-8 bytes through the encoding module", () => {
    const bytes = new TextEncoder().encode("MG Pro مرحباً");
    const encoded = bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(new TextDecoder().decode(b64urlToBytes(encoded))).toBe("MG Pro مرحباً");
  });

  it("parses plain-text payloads and classifies Gmail labels", () => {
    const data = bytesToB64(new TextEncoder().encode("hello")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(parsePayload({ mimeType: "text/plain", body: { data } }).text).toBe("hello");
    expect(folderFromLabels(["INBOX", "SPAM"])).toBe("spam");
  });

  it("composes a message with encoded subject and reply headers", () => {
    const raw = decodeRaw(buildRawMessage({ from: "a@example.test", to: "b@example.test", subject: "رد", body: "hello", inReplyTo: "<m1@example.test>" }));
    expect(raw).toContain("In-Reply-To: <m1@example.test>");
    expect(raw).toContain("Subject: =?UTF-8?B?");
  });

  it("sanitizes email HTML and extracts only HTTPS sender logos", () => {
    const html = safeEmailDocument('<img src=x onerror="alert(1)"><script>alert(2)</script>');
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert(2)");
    expect(extractLogoUrl('<img src="https://cdn.example/logo.png" width="120">')).toBe("https://cdn.example/logo.png");
  });
});
