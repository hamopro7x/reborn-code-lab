// Every database request gets a hard deadline. Without one, a slow or
// unreachable database made each open screen and server request wait forever,
// piling up until the site server ran out of memory and stopped answering.
// File storage uploads/downloads are excluded because large files legitimately
// take longer than an API call.

export const BROWSER_DB_TIMEOUT_MS = 20_000;
export const SERVER_DB_TIMEOUT_MS = 30_000;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function isStorageRequest(input: RequestInfo | URL): boolean {
  return requestUrl(input).includes("/storage/v1/");
}

export function withRequestTimeout(fetchImpl: typeof fetch, timeoutMs: number): typeof fetch {
  return (input, init) => {
    if (isStorageRequest(input)) return fetchImpl(input, init);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Database request timed out after ${timeoutMs}ms`)), timeoutMs);
    const outer = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
    if (outer) {
      if (outer.aborted) controller.abort(outer.reason);
      else outer.addEventListener("abort", () => controller.abort(outer.reason), { once: true });
    }
    return fetchImpl(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  };
}
