
const heavyInflight = new Map<string, Promise<any>>();

const heavyLast = new Map<string, { at: number; value: any }>();

export async function heavyOnce<T>(key: string, cooldownMs: number, run: () => Promise<T>): Promise<T> {
  const running = heavyInflight.get(key);
  if (running) return running as Promise<T>;
  const last = heavyLast.get(key);
  if (last && Date.now() - last.at < cooldownMs) return last.value as T;
  const p = run()
    .then((value) => {
      heavyLast.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      heavyInflight.delete(key);
    });
  heavyInflight.set(key, p);
  return p;
}

export const cardCache = new Map<string, { at: number; rows: any[] }>();

export const cardInflight = new Map<string, Promise<any[]>>();

/**
 * Query types, in ascending priority. The *_ALL / *_REVERSAL / *_REFUND types
 * are the ones Bybit documents as available to every user; SIDE_QUERY_FINANCIAL
 * and SIDE_QUERY_REFUND require txnId+orderNo, so they are no longer walked.
 * SIDE_QUERY_AUTH is kept for keys that do not support the newer types (a type
 * that errors is skipped by every walker).
 */

export const spendCache = new Map<string, { at: number; value: Promise<any> }>();

/**
 * Cached front of {@link computeSpendUncached}: reading a full month of card
 * records per account on every screen refresh made the whole site slow, so
 * identical requests share one result (and one in-flight read) for 30 seconds.
 */
