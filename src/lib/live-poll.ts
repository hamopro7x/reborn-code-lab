import type { Query } from "@tanstack/react-query";

export const POLL_BACKOFF_MAX_MS = 60_000;

/**
 * Polling interval that slows down while requests keep failing and returns to
 * normal after the first success. Without it, every open admin/employee screen
 * kept firing several requests every few seconds at a database that was
 * already struggling, which kept it from recovering.
 */
export function pollDelay(baseMs: number, failures: number): number {
  if (failures <= 0) return baseMs;
  return Math.min(baseMs * 2 ** Math.min(failures, 6), Math.max(baseMs, POLL_BACKOFF_MAX_MS));
}

export function livePoll(baseMs: number) {
  return (query: Query<any, any, any, any>) =>
    pollDelay(baseMs, query.state.status === "error" ? Math.max(1, query.state.fetchFailureCount) : query.state.fetchFailureCount);
}
