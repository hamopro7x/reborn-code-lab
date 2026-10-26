import { useSyncExternalStore } from "react";

/**
 * Display-only demo date for Bybit screens. Real data is never changed:
 * when enabled, every transaction keeps its own time of day but is shown
 * on DEMO_DAY. The choice is device-local and reversible.
 */
export const DEMO_DAY = { y: 2025, m: 1, d: 22 };
const KEY = "mg-bybit-demo-date";
const listeners = new Set<() => void>();

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let enabled = false;
let loaded = false;

export function isDemoDate(): boolean {
  if (!loaded && typeof window !== "undefined") {
    enabled = read();
    loaded = true;
  }
  return enabled;
}

export function setDemoDate(on: boolean) {
  enabled = on;
  loaded = true;
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useDemoDate(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    isDemoDate,
    () => false,
  );
}

/** Moves a timestamp onto the demo day (same local time of day) when enabled. */
export function demoTime<T extends string | number | Date | null | undefined>(value: T): T | number {
  if (!isDemoDate() || value === null || value === undefined || value === "") return value;
  const d = new Date(value as any);
  if (isNaN(d.getTime())) return value;
  return new Date(DEMO_DAY.y, DEMO_DAY.m - 1, DEMO_DAY.d, d.getHours(), d.getMinutes(), d.getSeconds()).getTime();
}

/** Display-only demo amounts shown on the spend/fee cards while demo date is on. */
export const DEMO_AMOUNTS = { monthSpend: 1980, daySpend: 96, monthFees: 0.5 };
