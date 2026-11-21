import { expect, it } from "vitest";
import { BodyLimitError, readLimitedBody } from "./limited-body.server";
it("preserves agent JSON at the limit without rewriting device secrets", async () => {
  const body = '{"p_device_id":"test-device","p_secret":"fixture-not-real"}';
  expect(await readLimitedBody(new Request("https://example.test", { method: "POST", body }), new TextEncoder().encode(body).length)).toBe(body);
});
it("rejects streamed multibyte input by bytes, without relying on Content-Length", async () => {
  await expect(readLimitedBody(new Request("https://example.test", { method: "POST", body: "أ".repeat(10) }), 10)).rejects.toBeInstanceOf(BodyLimitError);
});
it("rejects oversized advertised bodies before reading", async () => {
  await expect(readLimitedBody(new Request("https://example.test", { method: "POST", body: "small", headers: { "content-length": "999" } }), 100)).rejects.toBeInstanceOf(BodyLimitError);
});