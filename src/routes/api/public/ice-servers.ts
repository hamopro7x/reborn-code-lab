import { createFileRoute } from "@tanstack/react-router";

// STUN endpoints are public. TURN credentials are returned only when generated
// dynamically by Cloudflare or explicitly configured in server environment.
const STUN_ONLY = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

async function cloudflareTurn(keyId: string, token: string) {
  const res = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 43200 }),
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { iceServers?: unknown };
  const servers = json.iceServers;
  if (!servers) return null;
  return Array.isArray(servers) ? servers : [servers];
}

export const Route = createFileRoute("/api/public/ice-servers")({
  server: {
    handlers: {
      GET: async () => {
        const iceServers: unknown[] = [...STUN_ONLY];
        let hasTurn = false;

        const keyId = process.env["CLOUDFLARE_TURN_KEY_ID"];
        const token = process.env["CLOUDFLARE_TURN_API_TOKEN"];
        if (keyId && token) {
          try {
            const cf = await cloudflareTurn(keyId, token);
            if (cf?.length) {
              iceServers.push(...cf);
              hasTurn = true;
            }
          } catch {
            // Continue with explicitly configured TURN or STUN-only.
          }
        }

        const staticUrls = process.env["TURN_URLS"];
        const staticUser = process.env["TURN_USERNAME"];
        const staticPass = process.env["TURN_CREDENTIAL"];
        if (staticUrls && staticUser && staticPass) {
          const urls = staticUrls.split(",").map((u) => u.trim()).filter(Boolean);
          if (urls.length) {
            iceServers.push({ urls, username: staticUser, credential: staticPass });
            hasTurn = true;
          }
        }

        return new Response(JSON.stringify({ iceServers, hasTurn }), {
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
            "cache-control": "no-store",
          },
        });
      },
      OPTIONS: async () =>
        new Response(null, {
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "GET, OPTIONS",
          },
        }),
    },
  },
});
