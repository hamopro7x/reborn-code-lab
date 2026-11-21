/** Log only structured diagnostics, never provider responses, tokens or customer payloads. */
export function safeErrorDetails(error: unknown) {
  const object = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const name = typeof object.name === "string" && /^[A-Za-z0-9_]{1,50}$/.test(object.name) ? object.name : "Error";
  const code = typeof object.code === "string" && /^[A-Z0-9_]{1,40}$/.test(object.code) ? object.code : undefined;
  return { name, ...(code ? { code } : {}) };
}
export function logSafeError(scope: string, error: unknown) {
  console.error(scope, safeErrorDetails(error));
}
export function safeResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if ((headers.get("content-type") ?? "").includes("application/json")) headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}