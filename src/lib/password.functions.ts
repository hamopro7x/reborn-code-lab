import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Breached-password protection.
 * Checks candidate passwords against the Have I Been Pwned Pwned Passwords
 * corpus using k-anonymity (only the first 5 chars of the SHA-1 hash leave
 * the server; the full hash is never sent). Fails open on network errors so
 * an HIBP outage can never block sign-in, matching Supabase's own behavior.
 */

export const BREACHED_PASSWORD_MESSAGE =
  "كلمة السر دي ظهرت قبل كده في تسريبات معروفة على الإنترنت، اختار كلمة سر تانية";

export function rangeHasSuffix(rangeText: string, sha1Suffix: string): boolean {
  for (const line of rangeText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [suffix, count] = trimmed.split(":");
    if (suffix === sha1Suffix && Number(count) > 0) return true;
  }
  return false;
}

async function sha1Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export async function assertPasswordNotBreached(password: string): Promise<void> {
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  let response: Response;
  try {
    response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
  } catch {
    // Fail open: unreachable HIBP must not lock anyone out.
    return;
  }
  if (!response.ok) return;
  const text = await response.text();
  if (rangeHasSuffix(text, suffix)) throw new Error(BREACHED_PASSWORD_MESSAGE);
}

const breachCheckSchema = z.string().min(6).max(100);

export const checkBreachedPassword = createServerFn({ method: "POST" })
  .inputValidator((data) => breachCheckSchema.parse(data))
  .handler(async ({ data }) => {
    await assertPasswordNotBreached(data);
    return { ok: true };
  });
