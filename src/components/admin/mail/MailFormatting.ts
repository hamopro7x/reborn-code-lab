import { formatDateTime } from "@/lib/format";

const fmt = (d?: string | null) => formatDateTime(d);
const BRANDS: Record<string, string> = { paypal: "PayPal", tiktok: "TikTok", google: "Google", bybit: "Bybit", facebookmail: "Facebook", facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", linkedin: "LinkedIn", github: "GitHub", openai: "OpenAI", binance: "Binance", amazon: "Amazon", apple: "Apple", microsoft: "Microsoft", netflix: "Netflix", spotify: "Spotify", x: "X", twitter: "X", whatsapp: "WhatsApp", telegram: "Telegram", lovable: "Lovable" };
const SLD = new Set(["co", "com", "net", "org", "gov", "edu", "ac"]);
const platformName = (addr: string) => {
  const parts = (addr.split("@")[1] ?? "").toLowerCase().replace(/>.*/, "").split(".").filter(Boolean);
  if (parts.length < 2) return "";
  let i = parts.length - 2;
  if (SLD.has(parts[i]) && i > 0) i--;
  const n = parts[i];
  return BRANDS[n] ?? n.charAt(0).toUpperCase() + n.slice(1);
};
const sender = (f?: string | null) => {
  const raw = f ?? "";
  const name = raw.replace(/<.*>/, "").replace(/"/g, "").trim();
  if (name && !name.includes("@")) return name;
  const addr = raw.match(/<([^>]+)>/)?.[1] ?? name ?? raw;
  return platformName(addr) || name || raw || "—";
};
