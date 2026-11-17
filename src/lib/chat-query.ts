/** Keep confirmed rows visible during background failures without inventing an empty result. */
export function chatReadPhase(data: unknown, failed: boolean): "ready" | "retrying" | "loading" {
  if (data !== undefined) return "ready";
  return failed ? "retrying" : "loading";
}

export function chatRetryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 5000);
}