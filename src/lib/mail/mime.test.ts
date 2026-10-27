import { describe, it, expect } from "vitest";
import { folderFromLabels, buildRawMessage, safeEmailDocument } from "./mime";

const decode = (raw: string) => new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

describe("mail rules", () => {
  it("Gmail trash means remove locally", () => expect(folderFromLabels(["INBOX", "TRASH"])).toBe("trash"));
  it("spam wins over inbox", () => expect(folderFromLabels(["INBOX", "SPAM"])).toBe("spam"));
  it("reply keeps thread headers and encodes Arabic subject", () => {
    const m = decode(buildRawMessage({ from: "a@x.com", to: "b@y.com", subject: "رد", body: "مرحبا", inReplyTo: "<id1@x>", references: "<id0@x>" }));
    expect(m).toContain("In-Reply-To: <id1@x>");
    expect(m).toContain("References: <id0@x> <id1@x>");
    expect(m).toContain("Subject: =?UTF-8?B?");
  });
  it("strips scripts and event handlers from email HTML", () => {
    const d = safeEmailDocument('<img src=x onerror="alert(1)"><script>alert(2)</script>');
    expect(d).not.toContain("onerror");
    expect(d).not.toContain("alert(2)");
  });
});
