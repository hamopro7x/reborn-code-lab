import { describe, expect, it } from "vitest";
import { rejectFlyHost } from "./production-host";
describe("self-hosted domain restriction and liveness", () => {
  it.each(["mag-pro1.com", "www.mag-pro1.com", "127.0.0.1:3000", "localhost:3000", "app:3000"])("allows internal/custom-domain probes and scheduler paths on %s", (host) => {
    for (const path of ["/", "/api/public/build-version", "/api/public/hooks/bybit-ledger-sync"]) {
      expect(rejectFlyHost(new Request(`http://${host}${path}`))).toBe(false);
    }
  });
  it.each(["GET", "HEAD"])("permits only public build-version %s on the Fly hostname", (method) => {
    expect(rejectFlyHost(new Request("https://m-hamo.fly.dev/api/public/build-version", { method }))).toBe(false);
  });
  it("keeps the default Fly homepage, protected pages, RPCs and writes blocked", () => {
    for (const path of ["/", "/admin", "/api/public/hooks/bybit-ledger-sync", "/api/public/build-version/", "/_serverFn/fixture"]) {
      expect(rejectFlyHost(new Request(`https://m-hamo.fly.dev${path}`))).toBe(true);
    }
    expect(rejectFlyHost(new Request("https://m-hamo.fly.dev/api/public/build-version", { method: "POST" }))).toBe(true);
  });
  it("uses the actual Host header rather than an internal URL or forwarded-host hint", () => {
    expect(rejectFlyHost(new Request("http://127.0.0.1:3000/admin", { headers: { host: "M-HAMO.FLY.DEV:3000", "x-forwarded-host": "mag-pro1.com" } }))).toBe(true);
  });
});