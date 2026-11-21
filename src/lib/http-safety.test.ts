import { expect, it } from "vitest";
import { safeErrorDetails, safeResponse } from "./http-safety";
it("never logs provider bodies, messages, tokens or customer details", () => {
  expect(safeErrorDetails({ name: "Error", code: "ECONNRESET", message: "fixture-secret", details: "customer fixture", token: "fixture" })).toEqual({ name: "Error", code: "ECONNRESET" });
  expect(safeErrorDetails({ name: "secret data", code: "token=fixture" })).toEqual({ name: "Error" });
});
it("makes authenticated JSON uncacheable without changing Agent CORS or response content", async () => {
  const response = safeResponse(Response.json({ ok: true }, { headers: { "Access-Control-Allow-Origin": "*" } }));
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(await response.json()).toEqual({ ok: true });
});