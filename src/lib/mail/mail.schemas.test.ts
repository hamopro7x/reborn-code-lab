import { describe, expect, it } from "vitest";
import { listInput, sendInput } from "./mail.schemas";

const accountId = "123e4567-e89b-42d3-a456-426614174000";

describe("Gmail request schemas", () => {
  it("applies safe defaults to message listing", () => {
    expect(listInput.parse({})).toEqual({ view: "inbox" });
  });

  it("normalizes optional compose fields", () => {
    expect(sendInput.parse({ accountId, to: "staff@example.test" })).toMatchObject({
      accountId,
      to: "staff@example.test",
      cc: "",
      subject: "",
      body: "",
    });
  });

  it("enforces the message search length limit", () => {
    expect(() => listInput.parse({ search: "x".repeat(201) })).toThrow();
  });

  it("rejects invalid account ids and excessive attachment counts", () => {
    expect(() => sendInput.parse({ accountId: "not-a-uuid", to: "staff@example.test" })).toThrow();
    expect(() => sendInput.parse({ accountId, to: "staff@example.test", attachments: Array.from({ length: 11 }, () => ({ filename: "a", mimeType: "text/plain", base64: "YQ==" })) })).toThrow();
  });
});
