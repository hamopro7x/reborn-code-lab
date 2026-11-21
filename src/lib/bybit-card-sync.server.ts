import { SETTLEMENT_COPY_SIDES, SETTLEMENT_COPY_FILTER } from "./bybit-settlement";
import { createHmac } from "crypto";
import { admin, bybitConfigured, call, getCreds, listAccounts } from "./bybit-account.server";
import { fetchP2P, fetchOnChain, fetchInternal } from "./bybit-assets.server";
import type { AssetRow } from "./bybit-assets.server";
import { cardRowKey, mapCardTxn, mapStoredRow, sanitize } from "./bybit-card-mapper";
import { brandFromNumber } from "./bybit-cards.server";
import type { BybitCard } from "./bybit-cards.server";
import type { CardTxn } from "./bybit-card-mapper";
import type { Creds, BybitAccount } from "./bybit-account.server";
import { BYBIT_BASE_URL as BASE, BYBIT_RECV_WINDOW as RECV, num, sleep } from "./bybit-runtime";
import {
  sumSpend,
  sumSpendByCard,
  auditSpend,
  cardRecordOutcome,
  isCardReversalEvent,
  type SpendRow,
  cryptoSoldOf,
  isExplicitReversal,
  cardLinkIds,
  findLinkedReversals,
  REVERSAL_LINK_WINDOW_MS,
  type LinkCandidate,
  cardPurchaseGroup,
  cardFilterMatches,
  LEDGER_CARD_FILTERS,
  legacyReversalUnproven,
  durableCardReversal,
} from "./bybit-spend";
import { currentBybitCycle, currentBybitRows } from "./monthly-cycle.server";
import { isPastLastPage } from "./pagination";
import { cardConfirmed, archivedCardReadable, legacyCardReadable, CARD_READ_FILTER } from "./bybit-confirmation";
import { heavyOnce, cardCache, spendCache } from "./bybit-cache.server";
import { callCard, callCardPage, fetchCardPages, mergeCardTypeResults, isUnsupportedCardTypeError, isLateSettlementRecord, CARD_QUERY_TYPES } from "./bybit-card-api.server";
import { upsertLedger, mirrorStoredCardRows, markHangVoided } from "./bybit-ledger-write.server";

const MAX_TXNS = 10_000_000;

const PRUNE_TO_DELETE = 3_000_000;

export function sameStoredValue(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const sa = String(a), sb = String(b);
  if (sa === sb) return true;
  // Postgres returns "…+00:00" / numeric text; the client sends ISO "…Z" / numbers.
  const isTs = (s: string) => /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s);
  if (isTs(sa) && isTs(sb)) {
    const ta = Date.parse(sa.replace(" ", "T")), tb = Date.parse(sb.replace(" ", "T"));
    if (Number.isFinite(ta) && ta === tb) return true;
  }
  const na = Number(sa), nb = Number(sb);
  if (sa.trim() !== "" && sb.trim() !== "" && Number.isFinite(na) && na === nb) return true;
  return false;
}

export const detailText = (v: unknown) => v == null ? null : String(v);

/**
 * Persist fetched rows. Only transactions of the CURRENT monthly cycle are
 * archived: anything older than the cycle start (00:00 UTC of the last day of
 * the month) belongs to a closed cycle and is never stored again.
 */

export async function persistCardTxns(rows: CardTxn[], accountId?: string, assign = true): Promise<string[]> {
  if (!rows.length) return [];
  try {
    const { currentCycleStart } = await import("./monthly-cycle.server");
    const cycleStart = currentCycleStart();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: any[] = rows
      .filter((r) => Number(r.time ?? 0) >= cycleStart)
      .map((r) => ({
        txn_id: r.id,
        account_id: accountId ?? null,
        merchant: r.merchant,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        txn_time: r.time,
        pan4: r.pan4,
        txn_type: r.type,
        detail: r.detail,
    }));
    if (!payload.length) return [];

    // The database owns first_seen, ordering, confirmation and reconciliation.
    // No legacy upsert fallback: missing migration must fail closed.
    const observed = payload.map((r) => ({ ...r, observed_at: r.detail?.observedAt }));
    const { error } = await (supabaseAdmin as any).rpc("bybit_ingest_confirmed", {
      p_account: accountId ?? null, p_rows: observed,
    });
    if (error) throw new Error(`confirmation ingest failed: ${error.message}`);
    if (accountId) {
      await mirrorStoredCardRows(supabaseAdmin, accountId, payload.map((r) => r.txn_id),
        (ledger) => upsertLedger(ledger, assign));
      // Ingest reconciles dirty IDs and older affected candidates atomically.
      // The ledger trigger projects newly mirrored rows; no second account scan.
    }
    spendCache.clear();
    return [];
  } catch (e) {
    console.error("bybit_card_txns persist failed:", (e as any)?.message ?? e);
    throw e;
  }

}


/**
 * Full archive read, server-side only (per-card spend aggregation).
 * Never returned to the browser: the whole archive is too large for one
 * response, which is why the visible table pages through it instead.
 */

export async function storedCardTxns(limit: number, accountId?: string): Promise<CardTxn[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const CHUNK = 1000;
    const BATCH = 3; // fewer parallel database reads per request keeps the worker responsive
    const { periodStart, periodEnd } = currentBybitCycle();
    const data: any[] = [];
    for (let base = 0; base < limit; base += CHUNK * BATCH) {
      const requests: any[] = [];
      for (let i = 0; i < BATCH; i++) {
        const from = base + i * CHUNK;
        let query = (supabaseAdmin as any)
          .from("bybit_card_txns")
          .select("txn_id, account_id, created_at, confirmed_at, merchant, amount, currency, status, txn_time, pan4, txn_type, detail")
          .gte("txn_time", periodStart)
          .lt("txn_time", periodEnd)
          .or(SETTLEMENT_COPY_FILTER);
        if (accountId) query = query.eq("account_id", accountId);
        requests.push(query.order("txn_time", { ascending: false }).range(from, from + CHUNK - 1));
      }
      const chunks = await Promise.all(requests);
      const rows = chunks.flatMap(({ data: chunk }: any) => chunk ?? []);
      data.push(...rows);
      if (rows.length < CHUNK * BATCH) break;
    }
    const eligible = data.filter((r: any) => isCardReversalEvent(r.detail?.side || r.txn_type) || archivedCardReadable(r));
    return markHangVoided(eligible.map(mapStoredRow), eligible.map((r: any) => r.account_id ?? ""));
  } catch {
    return [];
  }
}

/** Maps one archived row to the shape the UI reads. */

export type CardTxnPage = {
  rows: CardTxn[];
  total: number;
  counts: Record<"all" | "success" | "failed" | "refund" | "review", number>;
};

/**
 * One page of the archive, filtered and counted in the database.
 * The whole archive is far too large to ship in a single response — that is why
 * the table reads it page by page instead of loading every stored row at once.
 */

export async function fetchCardTxnsPage(opts: {
  accountId?: string;
  status?: "all" | "success" | "failed" | "refund" | "review";
  page?: number;
  pageSize?: number;
  /** Employees never see reversed («معكوسة») attempts. */
  hideReversed?: boolean;
}): Promise<CardTxnPage> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const status = opts.status ?? "all";
  const pageSize = Math.min(Math.max(opts.pageSize ?? 150, 10), 500);
  const page = Math.max(opts.page ?? 1, 1);
  const from = (page - 1) * pageSize;
  const { periodStart, periodEnd } = currentCycleForRead();

  // The filter, the count and the page all come from ONE classification
  // (mapStoredRow + markHangVoided + cardPurchaseGroup), so a row shown as
  // «فاشلة» can never be counted under «المشتريات الناجحة» or vice versa.
  // A light projection of the cycle is classified first; only the page's
  // rows are then read in full.
  const light = await lightCycleRows(supabaseAdmin, opts.accountId, periodStart, periodEnd);
  let classified = light.filter((r) => r.readable && !isCardReversalEvent(r.t.detail?.side || r.t.type))
    .map((r) => ({ r, group: cardPurchaseGroup(r.t) }));
  if (opts.hideReversed) classified = classified.filter((x) => !x.r.t.reversed);
  const matching = classified.filter((x) => cardFilterMatches(status, x.group));
  const total = matching.length;
  const counts = { all: classified.length, success: 0, failed: 0, refund: 0, review: 0 };
  for (const x of classified) counts[x.group]++;
  const slice = matching.slice(from, from + pageSize);

  const full = new Map<string, any>();
  const ids = [...new Set(slice.map((x) => x.r.txn_id))];
  for (let i = 0; i < ids.length; i += 200) {
    let q = (supabaseAdmin as any)
      .from("bybit_card_txns")
      .select("txn_id, account_id, created_at, confirmed_at, merchant, amount, currency, status, txn_time, pan4, txn_type, detail")
      .in("txn_id", ids.slice(i, i + 200));
    if (opts.accountId) q = q.eq("account_id", opts.accountId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const r of data ?? []) full.set(`${r.account_id ?? ""}|${r.txn_id}`, r);
  }
  const rows: CardTxn[] = slice.map(({ r, group }) => {
    const f = full.get(`${r.account_id ?? ""}|${r.txn_id}`);
    const base = f ? mapStoredRow(f) : r.t;
    // Status/reversed come from the same classification used by the filter.
    void group;
    return { ...base, status: r.t.status, reversed: r.t.reversed };
  });
  return { rows, total, counts };
}

function currentCycleForRead() {
  return currentBybitCycle();
}

/** Light projection of one cycle (no raw blob), classified like the full rows. */

async function lightCycleRows(db: any, accountId: string | undefined, periodStart: number, periodEnd: number) {
  const CHUNK = 1000;
  const data: any[] = [];
  for (let from = 0; from < 200_000; from += CHUNK) {
    let q = db
      .from("bybit_card_txns")
      .select(
        "txn_id, account_id, created_at, confirmed_at, merchant, amount, currency, status, txn_time, pan4, txn_type, " +
          "tradeStatus:detail->>tradeStatus, side:detail->>side, cryptoSold:detail->>cryptoSold, " +
          "linkedBy:detail->>linkedBy, linkedReversal:detail->>linkedReversal, projectedStatus:detail->>projectedStatus, confirmationState:detail->>confirmationState, reconciliationState:detail->>reconciliationState, resolutionTarget:detail->>resolutionTarget, orderNo:detail->>orderNo, orderId:detail->>orderId, dTxnId:detail->>txnId",
      )
      .gte("txn_time", periodStart)
      .lt("txn_time", periodEnd)
      .or(SETTLEMENT_COPY_FILTER);
    if (accountId) q = q.eq("account_id", accountId);
    const { data: chunk, error } = await q
      .order("txn_time", { ascending: false })
      .order("txn_id", { ascending: true })
      .range(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);
    data.push(...(chunk ?? []));
    if ((chunk ?? []).length < CHUNK) break;
  }
  const mapped = data.map((r: any) =>
    mapStoredRow({
      ...r,
      detail: {
        tradeStatus: r.tradeStatus ?? null,
        side: r.side ?? null,
        cryptoSold: r.cryptoSold ?? null,
        confirmationState: cardConfirmed(r) ? "confirmed" : legacyCardReadable({ ...r, detail: { confirmationState: r.confirmationState } }) ? null : "waiting",
        projectedStatus: r.projectedStatus ?? null,
        reconciliationState: r.reconciliationState ?? null,
        resolutionTarget: r.resolutionTarget ?? null,
        linkedReversal: r.linkedReversal ?? null,
        linkedBy: r.linkedBy ?? null,
        orderNo: r.orderNo ?? null,
        orderId: r.orderId ?? null,
        txnId: r.dTxnId ?? null,
      },
    }),
  );
  const marked = markHangVoided(mapped, data.map((r: any) => r.account_id ?? ""));
  return marked.map((t, i) => ({ txn_id: String(data[i].txn_id), account_id: data[i].account_id ?? null, t,
    readable: archivedCardReadable({ ...data[i], detail: { confirmationState: data[i].confirmationState } }),
  }));
}

export async function fetchCardTxnsLive(opts: {
  accountId?: string;
  status?: "all" | "success" | "failed" | "refund" | "review";
  page?: number;
  pageSize?: number;
  hideReversed?: boolean;
}): Promise<CardTxnPage> {
  const status = opts.status ?? "all";
  const pageSize = Math.min(Math.max(opts.pageSize ?? 150, 10), 500);
  const page = Math.max(opts.page ?? 1, 1);

  // One shared live read per account per 20s. Repeated polls (or several open
  // admin screens) reuse it instead of each starting its own page walk.
  await heavyOnce(`live:${opts.accountId ?? "default"}`, 20_000, async () => {
    const { periodStart, periodEnd } = currentCycleForRead();
    const raw = await callCard(2_000, opts.accountId, undefined, periodStart);
    await persistCardTxns(raw.map(mapCardTxn).filter((r) => r.time >= periodStart && r.time < periodEnd), opts.accountId);
  });
  // Never return the uncensored provider response, including archive/API failure.
  return fetchCardTxnsPage({ ...opts, status, pageSize, page });
}

/** Sync recent records and one resumable historical chunk outside the visible read. */

export async function syncCardTxns(accountId?: string): Promise<{ added: number; backfillDone: boolean }> {
  return heavyOnce(`sync:${accountId ?? "default"}`, 10_000, async () => {
    const creds = await getCreds(accountId);
    // An explicit sync must ask the provider again; cached authorisation rows can
    // still say pending after the account history has already settled them.
    cardCache.delete(accountId ?? "default");
    const { currentCycleStart } = await import("./monthly-cycle.server");
    const liveRows = await callCard(2_000, accountId, creds, currentCycleStart());
    const rows = liveRows.map(mapCardTxn);
    await persistCardTxns(rows, accountId);
    const backfill = await backfillChunk(accountId, creds);
    return { added: rows.length + backfill.rows.length, backfillDone: backfill.done };
  });
}

/** Runs the same sync for every linked Bybit account. */

export async function syncAllCardTxns(): Promise<{ added: number; accounts: number }> {
  // One full sync at a time, at most once every 30s: several admin screens used
  // to launch a full multi-account sync each, which overloaded the server.
  return heavyOnce("sync:all", 8_000, async () => {
    // Purge first, before any provider network calls. This guarantees that merely
    // opening the central ledger removes closed-cycle rows immediately even when
    // Bybit is slow or unavailable.
    // Keep historical evidence. All reads/ingestion already enforce cycle cutoff.
    const accounts = await listAccounts();
    // Sequential: parallel account syncs multiplied both provider rate limits
    // and worker load.
    let added = 0;
    for (const a of accounts) {
      try {
        if (!(await bybitConfigured(a.id))) continue;
        const res = await syncCardTxns(a.id);
        added += res.added;
      } catch {
        /* حساب واحد يفشل لا يوقف الباقي */
      }
    }
    return { added, accounts: accounts.length };
  });
}



/* ---------- resumable deep backfill (back to account creation) ---------- */

type BackfillCursor = { version: number; typeIndex: number; page: number; done: boolean };
// Version 5 restarts cursors that may have been marked complete while the UI
// only executed one historical chunk. The new client keeps requesting chunks
// until this cursor reaches the oldest page for every transaction type.

const BACKFILL_VERSION = 6; // 6: query types changed to the documented *_ALL / *_REVERSAL set
// No page cap: pagination continues until Bybit reports the last (oldest) page.
// A wall-clock budget only decides when to pause and resume from the cursor.

const BACKFILL_BUDGET_MS = 20_000;

async function readCursor(key: string): Promise<BackfillCursor> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("site_settings")
      .select("value")
      .eq("key", `bybit_backfill:${key}`)
      .maybeSingle();
    const v = data?.value ?? {};
    // Version 1 used JSON-body filters that Bybit ignored, so its cursors
    // cannot prove that financial/refund history was actually archived.
    if (Number(v.version ?? 0) !== BACKFILL_VERSION) {
      // Older cursors may have stopped early, so restart from the first page to
      // guarantee everything back to account creation is archived.
      return { version: BACKFILL_VERSION, typeIndex: 0, page: 1, done: false };
    }
    return {
      version: BACKFILL_VERSION,
      typeIndex: Number(v.typeIndex ?? 0),
      page: Math.max(1, Number(v.page ?? 1)),
      done: Boolean(v.done),
    };
  } catch {
    return { version: BACKFILL_VERSION, typeIndex: 0, page: 1, done: false };
  }
}

async function writeCursor(key: string, cursor: BackfillCursor) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("site_settings")
      .upsert({ key: `bybit_backfill:${key}`, value: cursor as any }, { onConflict: "key" });
  } catch {
    /* best effort */
  }
}

/**
 * Walks a bounded slice of the historical card pages, persists it, and stores a
 * cursor so the next request resumes where this one stopped — until every page
 * back to account creation has been archived.
 */

async function backfillChunk(
  accountId: string | undefined,
  creds: Creds,
): Promise<{ rows: CardTxn[]; done: boolean }> {
  // Monthly cycles: history before the current cycle start is no longer kept,
  // so walking Bybit back to account creation would only re-fetch rows that
  // persistCardTxns drops again. The deep backfill is therefore disabled.
  void accountId;
  void creds;
  return { rows: [], done: true };
}

/** Kept for reference only; no longer part of any sync path. */

async function backfillChunkLegacy(
  accountId: string | undefined,
  creds: Creds,
): Promise<{ rows: CardTxn[]; done: boolean }> {
  const key = accountId ?? "default";
  const cursor = await readCursor(key);
  if (cursor.done) return { rows: [], done: true };



  const collected: any[] = [];
  let { typeIndex, page } = cursor;
  const deadline = Date.now() + BACKFILL_BUDGET_MS;

  try {
    while (typeIndex < CARD_QUERY_TYPES.length && Date.now() < deadline) {
      let result: any;
      try {
        result = await callCardPage({ limit: 100, page, type: CARD_QUERY_TYPES[typeIndex] }, creds);
      } catch (e) {
        if (!isUnsupportedCardTypeError(e)) throw e;
        // Rejected type: move on so the cursor never sticks on it forever.
        console.warn(`bybit backfill type ${CARD_QUERY_TYPES[typeIndex]} skipped:`, (e as Error)?.message);
        typeIndex++;
        page = 1;
        continue;
      }
      const rows = Array.isArray(result?.data) ? result.data : [];
      collected.push(...rows);


      const totalCount = Number(result?.totalCount ?? 0);
      const pageSize = Number(result?.pageSize ?? 100);
      const exhausted = !rows.length || (totalCount > 0 && page * pageSize >= totalCount);
      if (exhausted) {
        typeIndex++;
        page = 1;
      } else {
        page++;
      }
      await sleep(120);
    }
  } catch {
    /* keep whatever this chunk managed to read; retry from the cursor later */
  }

  const mapped = collected.map(mapCardTxn);
  for (let i = 0; i < mapped.length; i += 500) {
    await persistCardTxns(mapped.slice(i, i + 500), accountId);
  }
  const done = typeIndex >= CARD_QUERY_TYPES.length;
  await writeCursor(key, { version: BACKFILL_VERSION, typeIndex, page, done });
  return { rows: mapped, done };
}

/** Cards linked to the account. Stored cards are merged with spend derived from
 * the card transaction records. */

export async function fetchCards(accountId?: string): Promise<BybitCard[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let cardQuery = (supabaseAdmin as any).from("bybit_cards").select("*");
  if (accountId) cardQuery = cardQuery.eq("account_id", accountId);
  const { data: storedRows } = await cardQuery;
  const stored = (storedRows ?? []) as any[];

  const rows = await storedCardTxns(10_000, accountId);
  // Same engine as the account totals: one entry per purchase, USD amounts only.
  const perCard = sumSpendByCard(
    rows.map((t) => ({
      txnId: String(t.id ?? ""),
      amount: num(t.amount),
      time: Number(t.time ?? 0),
      status: t.status,
      type: t.type,
      currency: t.currency,
      detail: (t.detail ?? {}) as Record<string, unknown>,
      pan4: String(t.pan4 ?? ""),
      merchant: t.merchant,
    })) as Array<SpendRow & { pan4: string }>,
    (row) => (row as SpendRow & { pan4: string }).pan4,
    currentBybitCycle(),
  );
  const currencyByPan = new Map<string, string>();
  for (const t of rows) {
    const pan4 = String(t.pan4 ?? "").trim();
    if (pan4 && !currencyByPan.has(pan4)) currencyByPan.set(pan4, String(t.currency ?? "USD"));
  }

  const result: BybitCard[] = stored.map((s) => {
    const pan4 = String(s.pan4 ?? "").trim();
    const derived = perCard.get(pan4);
    const fromNumber = brandFromNumber(String(s.full_number ?? ""));
    return {
      id: s.id,
      pan4,
      brand: fromNumber ?? String(s.brand ?? "Visa"),
      currency: String(s.currency ?? currencyByPan.get(pan4) ?? "USD"),
      status: String(s.status ?? "active"),
      name: s.name ?? undefined,
      fullNumber: s.full_number ?? undefined,
      cvv: s.cvv ?? undefined,
      expiry: s.expiry ?? undefined,
      txnCount: derived?.totalTxns ?? 0,
      spend: derived?.spend ?? 0,
      lastUsed: derived?.lastUsed ?? 0,
      virtual: true,
    };
  });


  // Only cards explicitly added by the admin are shown.
  return result.sort((a, b) => b.lastUsed - a.lastUsed);
}

export async function fetchRecentCardRows(creds: Creds): Promise<any[]> {
  const results = await Promise.allSettled(
    CARD_QUERY_TYPES.map((type) => callCardPage({ limit: 100, page: 1, type }, creds)),
  );
  return mergeCardTypeResults(results);
}

/** A card reaches the ledger AND shift without waiting for transfers or other accounts. */

export async function syncAccountRecent(
  accountId: string,
  operations = {
    read: async () => fetchRecentCardRows(await getCreds(accountId)),
    persist: persistCardTxns,
  },
): Promise<number> {
  const raw = await operations.read();
  const mapped = currentBybitRows(raw.map(mapCardTxn));
  await operations.persist(mapped, accountId, true);
  return mapped.length;
}


/** Transfers have their own in-flight key: a slow transfer never locks card polling. */

export async function resumeCardFollowup() {
  const db = await admin();
  const accounts = await listAccounts();
  const { data: state, error } = await db.from("site_settings").select("value").eq("key", "bybit-confirm-followup-v1").maybeSingle();
  if (error) throw new Error(error.message);
  const cycle = currentBybitCycle().periodStart;
  const sameCycle = state?.value?.cycle === cycle;
  let index = sameCycle ? accounts.findIndex((a) => a.id === state?.value?.accountId) : 0;
  if (index < 0) index = 0;
  let type = sameCycle ? Number(state?.value?.type ?? 0) : 0;
  let page = sameCycle ? Math.max(1, Number(state?.value?.page ?? 1)) : 1;
  if (index >= accounts.length) index = 0;
  if (type >= CARD_QUERY_TYPES.length) type = 0;
  const account = accounts[index];
  if (!account) return;
  if (!(await bybitConfigured(account.id))) { index++; type=0; page=1; }
  else {
    try {
      const result = await callCardPage({ limit: 100, page, type: CARD_QUERY_TYPES[type] }, await getCreds(account.id));
      const raw = result.data ?? [];
      await persistCardTxns(currentBybitRows(raw.filter((r: any) => !isLateSettlementRecord(r)).map(mapCardTxn)), account.id);
      const exhausted = !raw.length || raw.some((r: any) => Number(r.txnCreate) < currentBybitCycle().periodStart) ||
        (Number(result.totalCount) > 0 && page*100 >= Number(result.totalCount));
      if (exhausted) { type++; page=1; } else page++;
    } catch (e) {
      if (!isUnsupportedCardTypeError(e)) throw e;
      type++; page=1;
    }
    if (type >= CARD_QUERY_TYPES.length) { index++; type=0; }
  }
  const { error: saveError } = await db.from("site_settings").upsert({ key: "bybit-confirm-followup-v1", value: { cycle, accountId: accounts[index % accounts.length]?.id, type, page } }, { onConflict: "key" });
  if (saveError) throw new Error(saveError.message);
}
