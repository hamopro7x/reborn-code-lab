/** Keep the default Fly site closed; allow only the already-public read-only build probe. */
export function rejectFlyHost(request: Request): boolean {
  const host = (request.headers.get("host") ?? new URL(request.url).host).split(":")[0]?.toLowerCase() ?? "";
  if (!host.endsWith(".fly.dev")) return false;
  const isBuildProbe = (request.method === "GET" || request.method === "HEAD") &&
    new URL(request.url).pathname === "/api/public/build-version";
  return !isBuildProbe;
}