/** Shared Bybit API constants and short retry/backoff delay helper. */
export const BYBIT_BASE_URL = "https://api.bybit.com";
export const BYBIT_RECV_WINDOW = "5000";
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const num = (value: unknown) => Number(value ?? 0) || 0;
