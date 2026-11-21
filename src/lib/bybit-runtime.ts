/** Shared short delay helper for Bybit retry and pagination backoff. */
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
