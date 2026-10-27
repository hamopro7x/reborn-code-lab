import paypal from "@/assets/mail-logos/paypal.svg.asset.json";
import tiktok from "@/assets/mail-logos/tiktok.svg.asset.json";
import facebook from "@/assets/mail-logos/facebook.svg.asset.json";
import instagram from "@/assets/mail-logos/instagram.svg.asset.json";
import linkedin from "@/assets/mail-logos/linkedin.svg.asset.json";
import x from "@/assets/mail-logos/x.svg.asset.json";
import google from "@/assets/mail-logos/google.svg.asset.json";
import binance from "@/assets/mail-logos/binance.svg.asset.json";

const brands = [
  { name: "PayPal", domains: ["paypal.com", "paypal.co.uk"], url: paypal.url },
  { name: "TikTok", domains: ["tiktok.com", "tiktokshop.com"], url: tiktok.url },
  { name: "Facebook", domains: ["facebook.com", "facebookmail.com", "meta.com"], url: facebook.url },
  { name: "Instagram", domains: ["instagram.com", "mail.instagram.com"], url: instagram.url },
  { name: "LinkedIn", domains: ["linkedin.com"], url: linkedin.url },
  { name: "X", domains: ["x.com", "twitter.com"], url: x.url },
  { name: "Google", domains: ["google.com", "accounts.google.com", "youtube.com"], url: google.url },
  { name: "Binance", domains: ["binance.com"], url: binance.url },
];

/** Match the actual mailbox domain, never an untrusted display name. */
export function senderBrand(address?: string | null) {
  if (!address) return undefined;
  const mailbox = address.match(/<([^<>]+)>/)?.[1] ?? address.trim();
  const domain = mailbox.match(/^[^\s<>@]+@([a-z0-9.-]+)$/i)?.[1]?.toLowerCase();
  if (!domain) return undefined;
  return brands.find((brand) => brand.domains.some((known) => domain === known || domain.endsWith(`.${known}`)));
}