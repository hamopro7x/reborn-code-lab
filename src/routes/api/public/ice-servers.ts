import { createFileRoute } from "@tanstack/react-router";

// نقطة عامة تُسلّم خوادم ICE (STUN/TURN) لكل من لوحة الإدارة وبرنامج الموظف.
// لا تُعيد أي بيانات حساسة: فقط بيانات دخول TURN مؤقتة (صلاحية قصيرة).

const STUN_ONLY = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

async function cloudflareTurn(keyId: string, token: string) {
  const res = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 43200 }),
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

        const keyId = process.env["CLOUDFLARE_TURN_KEY_ID"];
        const token = process.env["CLOUDFLARE_TURN_API_TOKEN"];
        if (keyId && token) {
          try {
            const cf = await cloudflareTurn(keyId, token);
            if (cf) iceServers.push(...cf);
          } catch {
            /* نتجاهل ونكمل بـ STUN */
          }
        }

        const staticUrls = process.env["TURN_URLS"];
        const staticUser = process.env["TURN_USERNAME"];
        const staticPass = process.env["TURN_CREDENTIAL"];
        if (staticUrls && staticUser && staticPass) {
          iceServers.push({
            urls: staticUrls.split(",").map((u) => u.trim()).filter(Boolean),
            username: staticUser,
            credential: staticPass,
          });
        }

        return new Response(JSON.stringify({ iceServers }), {
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
          },
        }),
    },
  },
});
