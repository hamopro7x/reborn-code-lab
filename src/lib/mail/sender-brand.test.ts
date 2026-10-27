import { describe, expect, it } from "vitest";
import { senderBrand } from "./sender-brand";

describe("static sender company logos", () => {
  it("matches PayPal sender subdomains", () => {
    expect(senderBrand('"PayPal" <service@intl.paypal.com>')?.name).toBe("PayPal");
    expect(senderBrand("service@PAYPAL.COM")?.url).toBeTruthy();
  });
  it("matches each supported company mailbox", () => {
    for (const [address, name] of [
      ["notify@tiktok.com", "TikTok"], ["security@facebookmail.com", "Facebook"],
      ["security@mail.instagram.com", "Instagram"], ["jobs@linkedin.com", "LinkedIn"],
      ["info@twitter.com", "X"], ["no-reply@accounts.google.com", "Google"],
      ["support@binance.com", "Binance"],
    ]) expect(senderBrand(address)?.name).toBe(name);
  });
  it("does not use misleading company display names or lookalike domains", () => {
    expect(senderBrand('"PayPal" <fake@example.com>')).toBeUndefined();
    expect(senderBrand("fake@paypal.com.example.com")).toBeUndefined();
    expect(senderBrand("fake@notpaypal.com")).toBeUndefined();
  });
  it("leaves personal and unknown mailboxes on the mail icon fallback", () => {
    expect(senderBrand("person@gmail.com")).toBeUndefined();
    expect(senderBrand("person@example.com")).toBeUndefined();
    expect(senderBrand(null)).toBeUndefined();
  });
});