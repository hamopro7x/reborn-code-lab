import { SETTLEMENT_COPY_FILTER } from "./bybit-settlement";
import { mapLimit } from "./bybit-concurrency.server";
import { admin, bybitConfigured, listAccounts } from "./bybit-account.server";
import type { BybitAccount } from "./bybit-account.server";
import { isCardReversalEvent, type SpendRow, cardPurchaseGroup, cardFilterMatches } from "./bybit-spend";
import { currentBybitCycle } from "./monthly-cycle.server";
import { cardConfirmed } from "./bybit-confirmation";
import { heavyOnce } from "./bybit-cache.server";
import { syncAllCardTxns, syncAccountRecent } from "./bybit-card-sync.server";
import { upsertLedger, cardLedgerRow, assetLedgerRows, type LedgerInsert } from "./bybit-ledger-write.server";


export async function syncAccountLedger(accountId: string): Promise<number> {
  const db = await admin();
  const rows: LedgerInsert[] = [];
  // Bounded repair, not archive/ledger count equality (side2 can never match).
  // Stable ID cursor survives late inserts; restart the cycle after exhaustion.
  const { periodStart, periodEnd } = currentBybitCycle();
  const key = `bybit-ledger-repair-v2:${accountId}`;
  const { data: state, error: stateError } = await db.from("site_settings")
    .select("value").eq("key", key).maybeSingle();
  if (stateError) throw new Error(stateError.message);
  const cursor = state?.value?.cycle === periodStart ? String(state.value.after ?? "") : "";
  let q = db.from("bybit_card_txns")
    .select("txn_id, created_at, confirmed_at, merchant, amount, currency, status, txn_time, pan4, txn_type, detail")
    .eq("account_id", accountId).gte("txn_time", periodStart).lt("txn_time", periodEnd).or(SETTLEMENT_COPY_FILTER);
  if (cursor) q = q.gt("txn_id", cursor);
  const { data: cards, error: cardError } = await q.order("txn_id", { ascending: true }).limit(200);
  if (cardError) throw new Error(cardError.message);
  const batch = cards ?? [];
  for (const c of batch) {
    if (cardConfirmed(c) && !isCardReversalEvent(c.detail?.side || c.txn_type)) rows.push(cardLedgerRow(accountId, c));
  }
  const cardSaved = await upsertLedger(rows);
  const { error: cursorError } = await db.from("site_settings").upsert({ key,
    value: { cycle: periodStart, after: batch.length === 200 ? batch[batch.length - 1]?.txn_id : "" },
  }, { onConflict: "key" });
  if (cursorError) throw new Error(cursorError.message);

  // 2) on-chain + internal transfers + P2P (live from Bybit)
  return cardSaved + await upsertLedger(await assetLedgerRows(accountId));
}

/** Runs the ledger sync for every linked account. */

export async function syncAllLedger(): Promise<{ saved: number; accounts: number }> {
  // Shared, sequential and rate-limited for the same reason as syncAllCardTxns.
  return heavyOnce("ledger:all", 8_000, async () => {
    const accounts = await listAccounts();
    let saved = 0;
    for (const a of accounts) {
      try {
        saved += await syncAccountLedger(a.id);
      } catch {
        /* حساب واحد يفشل لا يوقف الباقي */
      }
    }
    return { saved, accounts: accounts.length };
  });
}

/* ---------- fast "recent" sync (the real-time path) ----------
 * ROOT CAUSE of the delays: every tick used to re-walk the WHOLE month of card
 * history (3 query types x up to 20 pages, with pauses) for every account one
 * after another, then re-mirror each archive and only then link the shift. With
 * several accounts one tick took minutes, so a new purchase waited for all of it.
 *
 * The fast path reads only the newest page of each type per account (all
 * accounts in parallel), archives + mirrors exactly those rows, and links the
 * open shift once. The deep month walk still runs, but in the background at
 * most every few minutes, to catch late status changes on older rows.
 */

function runRecentAssetSync(accounts: BybitAccount[]): void {
  void heavyOnce("recent:assets", 15_000, async () => {
    await mapLimit(accounts, 2, async (account) => {
      if (!(await bybitConfigured(account.id))) return;
      await upsertLedger(await assetLedgerRows(account.id));
    });
  }).catch((e) => console.error("recent asset sync failed:", (e as Error)?.message));
}

/** Fast card sync; each account links its shift as soon as its own rows land. */

export async function syncAllRecent(): Promise<{ saved: number; accounts: number }> {
  // Screens and the server loop all ask for this; one pass per 5 s per server
  // is as fresh as the 5 s loop and stops open screens from multiplying load.
  return heavyOnce("recent:all", 5_000, async () => {
    const accounts = await listAccounts();
    let saved = 0;
    await mapLimit(accounts, 1, async (a) => {
      if (!(await bybitConfigured(a.id))) return;
      saved += await syncAccountRecent(a.id);
    });
    runRecentAssetSync(accounts);
    return { saved, accounts: accounts.length };
  });
}

const DEEP_EVERY_MS = 5 * 60_000;
let lastDeepAt = 0;

/** Full month walk, in the background, at most every few minutes. Never awaited by screens. */

export function runDeepSyncIfDue(force = false): void {
  if (!force && Date.now() - lastDeepAt < DEEP_EVERY_MS) return;
  lastDeepAt = Date.now();
  void heavyOnce("deep:all", 0, async () => {
    try {
      await syncAllCardTxns();
    } catch {
      /* keep going to the ledger */
    }
    await syncAllLedger();
  }).catch((e) => console.error("deep bybit sync failed:", (e as Error)?.message));
}

/**
 * Screens call this before reading: it starts the fast sync without blocking
 * the response; Realtime refreshes the screen once the new rows land.
 */

export async function pullFromBybit(maxWaitMs = 0): Promise<void> {
  const job = syncAllRecent().catch(() => undefined);
  runDeepSyncIfDue();
  if (maxWaitMs > 0) await Promise.race([job, new Promise((r) => setTimeout(r, maxWaitMs))]);
}


export { fetchLedgerPage } from "./bybit-ledger-read.server";

export { listReversalCases } from "./bybit-ledger-read.server";

/** One history page per tick, durable cursor; full cycle is walked repeatedly.
 * No timeout sleeping for confirmation, no dependence on an open browser. */