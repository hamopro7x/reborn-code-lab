import { createFileRoute } from "@tanstack/react-router";

// Public endpoint used by the admin dashboard and employee desktop agent.
// TURN credentials must be generated server-side or supplied through deployment
// secrets. Never embed shared provider credentials in a public source file.

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
      signal: AbortSignal.timeout(8000),
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
            // Fail closed to STUN-only; never fall back to shared public credentials.
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

        return Response.json(
          { iceServers, hasTurn },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
