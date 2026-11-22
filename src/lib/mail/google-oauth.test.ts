import { afterEach, describe, expect, it, vi } from "vitest";
import { authUrl, GMAIL_SCOPES, oauthConfig } from "./google-oauth.server";

afterEach(() => vi.unstubAllEnvs());

describe("Google OAuth configuration", () => {
  it("builds a consent URL with the supplied state and PKCE challenge", () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", "https://example.test/api/public/mail-oauth/callback");

    const url = new URL(authUrl("state-value", "pkce-challenge"));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge")).toBe("pkce-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(GMAIL_SCOPES);
  });

  it("fails closed when a required OAuth setting is missing", () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", "https://example.test/callback");
    expect(() => oauthConfig()).toThrow("إعدادات Google OAuth غير مضبوطة على السيرفر");
  });
});
