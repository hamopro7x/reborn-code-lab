import { SETTLEMENT_COPY_SIDES, SETTLEMENT_COPY_FILTER } from "./bybit-settlement";
import { createHmac } from "crypto";
import { admin, bybitConfigured, call, getCreds, listAccounts } from "./bybit-account.server";
import { fetchP2P, fetchOnChain, fetchInternal } from "./bybit-assets.server";
import type { AssetRow } from "./bybit-assets.server";
import { cardRowKey, mapCardTxn, mapStoredRow, sanitize } from "./bybit-card-mapper";
import { brandFromNumber } from "./bybit-cards.server";
import type { BybitCard } from "./bybit-cards.server";
import type { CardTxn } from "./bybit-card-mapper";
import { sameStoredValue, detailText } from "./bybit-value-helpers";
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

export type LedgerRow = {
  id: string;
  accountId: string | null;
  accountName: string;
  kind: string;
  direction: "in" | "out";
  refId: string;
  title: string;
  amount: number;
  currency: string;
  fee: number;
  status: string;
  time: number;
  detail: Record<string, string | number | boolean | null>;
};

export type LedgerPage = {
  rows: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
};

export type LedgerInsert = {
  account_id: string | null;
  kind: string;
  direction: "in" | "out";
  ref_id: string;
  title: string;
  amount: number;
  currency: string;
  fee: number;
  status: string;
  occurred_at: string;
  detail: Record<string, string | number | boolean | null>;
};

const iso = (ms: number) => new Date(ms > 0 ? ms : Date.now()).toISOString();

/** الأعمدة التي تحدّد «هل تغيّر صف السجل فعلًا؟». */

const LEDGER_COMPARE = [
  "direction",
  "title",
  "amount",
  "currency",
  "fee",
  "status",
  "occurred_at",
] as const;

/** يرجّع صفوف السجل الجديدة أو المتغيّرة فقط (نفس منطق معاملات الكروت). */

async function changedLedgerRows(db: any, rows: LedgerInsert[]): Promise<LedgerInsert[]> {
  const out: LedgerInsert[] = [];
  const key = (r: { account_id: string | null; kind: string; ref_id: string }) =>
    `${r.account_id ?? ""}|${r.kind}|${r.ref_id}`;
  for (let i = 0; i < rows.length; i += 500) {
    const slice = rows.slice(i, i + 500);
    const { data, error } = await db
      .from("bybit_ledger")
      .select(
        "account_id, kind, ref_id, direction, title, amount, currency, fee, status, occurred_at, " +
          "tradeStatus:detail->>tradeStatus, side:detail->>side, linkedReversal:detail->>linkedReversal",
      )
      .in(
        "ref_id",
        slice.map((r) => r.ref_id),
      );
    if (error) {
      out.push(...slice);
      continue;
    }
    const existing = new Map((data ?? []).map((r: any) => [key(r), r]));
    for (const row of slice) {
      const prev = existing.get(key(row)) as any;
      const d = ((row as any).detail ?? {}) as Record<string, unknown>;
      // Archive projections already incorporate immutable admin/provider evidence.
      // Never reintroduce a legacy ledger-only sticky guess here.
      if (
        !prev ||
        LEDGER_COMPARE.some((k) => !sameStoredValue(prev[k], (row as any)[k])) ||
        (["tradeStatus", "side", "linkedReversal"] as const).some(
          (k) => !sameStoredValue(prev[k], detailText(((row as any).detail ?? {})[k])),
        )
      ) {
        out.push(row);
      }
    }
  }
  return out;
}

export async function upsertLedger(rows: LedgerInsert[], assign = true) {
  // Central + internal transactions follow the same monthly cycle as spend:
  // only movements inside the current cycle are mirrored/kept.
  const { currentCycleStart } = await import("./monthly-cycle.server");
  const cycleStart = currentCycleStart();
  const clean = rows.filter(
    (r) => r.ref_id && new Date(String(r.occurred_at)).getTime() >= cycleStart,
  );
  if (!clean.length) return 0;

  const db = await admin();
  let saved = 0;
  // نكتب الجديد والمتغيّر فقط: لا إعادة كتابة لكل السجل في كل دورة.
  const pending = await changedLedgerRows(db, clean);
  for (let i = 0; i < pending.length; i += 500) {
    const { error } = await db
      .from("bybit_ledger")
      .upsert(pending.slice(i, i + 500), { onConflict: "account_id,kind,ref_id" });
    if (error) throw new Error(`bybit ledger save failed: ${error.message}`);
    else saved += Math.min(500, pending.length - i);
  }

  // (Removed) refund rows used to flip every kind="card" row with the same
  // ref_id to "reversed" across ALL accounts. A real refund is not an
  // authorisation reversal; confirmed reversals are linked per account in
  // linkReversalsBeforeSave and reach the ledger through cardLedgerRow.

  // Work-sheet layer: link the freshly mirrored movements to the open shift.
  // Never modifies ledger rows; failures here must not break the sync.
  if (!assign) return saved;
  try {
    const work = await import("./work-assign.server");
    await work.autoAssignLedger(db);
  } catch (e) {
    console.error("work auto-assign skipped:", (e as Error)?.message);
  }
  return saved;
}


/** Archive rows → hung-retry voids («معكوسة») shown as failed, like Bybit. */
/** Classify only reversals evidenced by Bybit, never by a second similar charge. */

export function markHangVoided(rows: CardTxn[], scopes?: unknown[]): CardTxn[] {
  const linked = findLinkedReversals(
    rows.map((t, i) => {
      const ids = cardLinkIds(t.detail);
      return {
        id: String(t.id),
        scope: scopes?.[i] ?? "",
        orderNo: ids.orderNo,
        txnId: ids.txnId || String(t.id),
        tradeStatus: t.detail?.["confirmationState"] ? null : t.detail?.["tradeStatus"],
        side: t.detail?.["side"] ?? t.type,
        pan4: t.pan4 ?? t.detail?.["pan4"],
        amount: t.amount,
        time: t.time,
      };
    }),
  );
  if (!linked.size) return rows;
  return rows.map((t, i) =>
    linked.has(String(t.id)) && t.status !== "refund" && rows.some((other, j) => j !== i &&
      String(scopes?.[j] ?? "") === String(scopes?.[i] ?? "") && isCardReversalEvent(other.detail?.side ?? other.type) &&
      ((cardLinkIds(other.detail).orderNo && cardLinkIds(other.detail).orderNo === cardLinkIds(t.detail).orderNo) ||
        (cardLinkIds(other.detail).txnId && cardLinkIds(other.detail).txnId === cardLinkIds(t.detail).txnId)))
      ? { ...t, status: "failed", reversed: true }
      : t,
  );
}

/** One central-ledger row built from one archived card record (single source of truth). */

export function cardLedgerRow(accountId: string, c: any): LedgerInsert {
  const t = mapStoredRow(c);
  // This is the exact normalized row shown by the account's internal log.
  // A reversed authorisation is labelled "reversed" («معكوسة») like Bybit; it
  // is not a successful status, so the shift sheet never counts it.
  const reversed =
    Boolean(t.reversed) ||
    cardRecordOutcome(t.detail?.["tradeStatus"], t.detail?.["side"] ?? t.type, cryptoSoldOf(t.detail)) === "reversed";
  const status: string = t.status === "review" ? "review" : reversed ? "reversed" : t.status;
  const isRefund = status === "refund";
  const src = (t.detail ?? {}) as Record<string, any>;
  const { raw: _raw, ...original } = src;
  // Fee comes straight from the source account's own fee field (totalFees).
  const rawSrc = (src["raw"] ?? {}) as Record<string, any>;
  const feeRaw =
    src["totalFees"] ?? rawSrc["totalFees"] ?? src["feeAmount"] ?? rawSrc["foreignTransactionFee"] ?? null;
  const feeVal = feeRaw === null || feeRaw === undefined || feeRaw === "" ? 0 : num(feeRaw);
  return {
    account_id: accountId,
    kind: isRefund ? "refund" : "card",
    direction: isRefund ? "in" : "out",
    ref_id: String(t.id),
    title: t.merchant,
    amount: isRefund ? Math.abs(t.amount) : -Math.abs(t.amount),
    currency: t.currency,
    fee: feeVal,
    status,
    occurred_at: iso(t.time),
    // Full original payload (minus the oversized raw blob) so the central
    // ledger can render exactly the same fields as the source account.
    detail: sanitize({
      ...original,
      pan4: t.pan4 ?? null,
      totalFees: feeRaw,
      foreignTransactionFee: src["foreignTransactionFee"] ?? rawSrc["foreignTransactionFee"] ?? null,
      type: t.type ?? null,
      merchantName: src["merchantName"] ?? t.merchant ?? null,
      basicAmount: src["basicAmount"] ?? t.amount,
      basicCurrency: src["basicCurrency"] ?? t.currency,
    }),
  };
}

/** Mirror only persisted rows, with account and reset scoping; safe to retry. */

export async function mirrorStoredCardRows(
  db: any,
  accountId: string,
  ids: string[],
  save: (rows: LedgerInsert[]) => Promise<number> = upsertLedger,
): Promise<number> {
  const unique = [...new Set(ids.filter(Boolean))];
  const { periodStart, periodEnd } = currentBybitCycle();
  let saved = 0;
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await db.from("bybit_card_txns")
      .select("txn_id, created_at, confirmed_at, merchant, amount, currency, status, txn_time, pan4, txn_type, detail")
      .eq("account_id", accountId)
      .gte("txn_time", periodStart).lt("txn_time", periodEnd)
      .in("txn_id", unique.slice(i, i + 200));
    if (error) throw new Error(`card ledger mirror read failed: ${error.message}`);
    const rows = (data ?? [])
      .filter((row: any) => cardConfirmed(row) && !isCardReversalEvent(row.detail?.side || row.txn_type) && !SETTLEMENT_COPY_SIDES.has(String(row.detail?.side ?? "")))
      .map((row: any) => cardLedgerRow(accountId, row));
    if (rows.length) saved += await save(rows);
  }
  return saved;
}

/** On-chain, internal transfers and P2P of one account, read live from Bybit. */

export async function assetLedgerRows(accountId: string): Promise<LedgerInsert[]> {
  const rows: LedgerInsert[] = [];
  const [onchain, internal, p2p] = await Promise.allSettled([
    fetchOnChain(accountId),
    fetchInternal(accountId),
    fetchP2P(accountId),
  ]);
  const pushAssets = (list: AssetRow[], kind: string) => {
    for (const a of list) {
      if (!a.id) continue;
      rows.push({
        account_id: accountId,
        kind,
        direction: a.direction,
        ref_id: a.id,
        title: `${a.coin}${a.chain ? ` · ${a.chain}` : ""}`,
        amount: a.amount,
        currency: a.coin || "USDT",
        fee: a.fee,
        status: a.status,
        occurred_at: iso(a.time),
        detail: { address: a.address, chain: a.chain },
      });
    }
  };
  if (onchain.status === "fulfilled") {
    pushAssets(onchain.value.deposits, "deposit");
    pushAssets(onchain.value.withdrawals, "withdraw");
  }
  if (internal.status === "fulfilled") {
    pushAssets(internal.value.deposits, "internal_in");
    pushAssets(internal.value.withdrawals, "internal_out");
  }
  if (p2p.status === "fulfilled") {
    for (const o of p2p.value) {
      if (!o.id) continue;
      rows.push({
        account_id: accountId,
        kind: o.side === "sell" ? "p2p_sell" : "p2p_buy",
        direction: o.side === "sell" ? "out" : "in",
        ref_id: o.id,
        title: `P2P ${o.coin}/${o.fiat}${o.counterparty ? ` · ${o.counterparty}` : ""}`,
        amount: o.side === "sell" ? -Math.abs(o.quantity) : Math.abs(o.quantity),
        currency: o.coin || "USDT",
        fee: 0,
        status: o.status,
        occurred_at: iso(o.time),
        detail: { fiatAmount: o.amount, fiat: o.fiat, price: o.price, counterparty: o.counterparty ?? null },
      });
    }
  }
  return rows;
}

/** Mirrors every movement type of one account into the central ledger. */
