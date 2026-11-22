import { admin } from "./bybit-account.server";
import { num } from "./bybit-runtime";
import { LEDGER_CARD_FILTERS } from "./bybit-spend";
import { currentBybitCycle } from "./monthly-cycle.server";
import { isPastLastPage } from "./pagination";
import { CARD_READ_FILTER } from "./bybit-confirmation";
import type { LedgerPage } from "./bybit-ledger-write.server";

/** Ledger query group and sub-filter mapping; kept local to the read module. */
const GROUP_KINDS: Record<string, string[]> = {
  txns: ["card", "refund"],
  onchain: ["deposit", "withdraw"],
  internal: ["internal_in", "internal_out"],
  p2p: ["p2p_buy", "p2p_sell"],
};

/** Sub-filters inside a group map straight to one ledger kind. */
const SUB_KIND: Record<string, string> = {
  deposit: "deposit",
  withdraw: "withdraw",
  internal_in: "internal_in",
  internal_out: "internal_out",
  p2p_buy: "p2p_buy",
  p2p_sell: "p2p_sell",
};

/** One page of the central ledger across all accounts. */
export async function fetchLedgerPage(opts: {
  group?: string;
  status?: string;
  accountId?: string;
  page?: number;
  pageSize?: number;
  /** Employees never see reversed («معكوسة») attempts. */
  hideReversed?: boolean;
}): Promise<LedgerPage> {
  const db = await admin();
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 10), 200);
  const page = Math.max(opts.page ?? 1, 1);
  const from = (page - 1) * pageSize;
  const group = GROUP_KINDS[opts.group ?? "txns"] ? (opts.group as string) : "txns";
  const status = opts.status && opts.status !== "all" ? opts.status : "all";

  const { accountLabels } = await import("./account-labels.server");
  const nameById = await accountLabels(db);

  const base = () => {
    const { periodStart, periodEnd } = currentBybitCycle();
    // PostgREST exposes filters only after select(), not on from().
    const q = db.from("bybit_ledger").select("*", { count: "exact" })
      .gte("occurred_at", new Date(periodStart).toISOString())
      .lt("occurred_at", new Date(periodEnd).toISOString());
    return q;
  };

  const applyScope = (q: any, g: string, st: string) => {
    let out = q;
    if (opts.accountId) out = out.eq("account_id", opts.accountId);
    // side=2 is an authorisation-reversal EVENT, not a separate purchase.
    // Use JSONB containment NOT filters: unlike .or(), these compose with the
    // success/failed/refund OR filters instead of overwriting them in PostgREST.
    // Handle both string and numeric side values in legacy stored rows.
    if (g === "txns") out = out
      .or(CARD_READ_FILTER)
      .neq("status", "holding")
      .not("detail", "cs", '{"side":"2"}')
      .not("detail", "cs", '{"side":2}');
    if (opts.hideReversed) out = out.or("status.is.null,status.neq.reversed");
    if (g === "txns" && st === "review") out = out.eq("kind", "card").or(LEDGER_CARD_FILTERS.review.slice(3, -1));
    else if (g === "txns" && st === "refund") out = out.in("kind", ["card", "refund"]).or(LEDGER_CARD_FILTERS.refund.slice(3, -1));
    // Same groups as cardPurchasePresenter: ناجحة = everything not failed/reversed
    // (pending included), فاشلة = failed/reversed/linkedReversal.
    else if (g === "txns" && st === "success") {
      out = out.eq("kind", "card");
      for (const f of LEDGER_CARD_FILTERS.success) out = f.startsWith("or(") ? out.or(f.slice(3, -1)) : out.is("detail->>resolutionTarget", null);
    } else if (g === "txns" && st === "failed")
      out = out.eq("kind", "card").or(LEDGER_CARD_FILTERS.failed.slice(3, -1));
    else if (g !== "txns" && SUB_KIND[st] && (GROUP_KINDS[g] as string[]).includes(SUB_KIND[st]))
      out = out.eq("kind", SUB_KIND[st]);
    else out = out.in("kind", GROUP_KINDS[g] as string[]);
    return out;
  };

  // One round trip: the page rows and the row count for the same scope. The
  // previous version issued ~15 extra exact-count scans per request (one per
  // group and sub-filter) even though the UI shows no counters — that alone
  // made every ledger read scan the whole table more than a dozen times.
  let { data, error, count } = (await applyScope(base(), group, status)
    .order("occurred_at", { ascending: false })
    .range(from, from + pageSize - 1)) as {
    data: any[] | null;
    error: { code?: string; message: string } | null;
    count: number | null;
  };
  if (isPastLastPage(error)) {
    // The list shrank under an open page (reset, archive): empty page + real total.
    const head = (await applyScope(
      db.from("bybit_ledger").select("id", { count: "exact", head: true })
        .gte("occurred_at", new Date(currentBybitCycle().periodStart).toISOString())
        .lt("occurred_at", new Date(currentBybitCycle().periodEnd).toISOString()),
      group,
      status,
    )) as { error: { message: string } | null; count: number | null };
    if (head.error) throw new Error(head.error.message);
    data = [];
    error = null;
    count = head.count ?? 0;
  }
  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  const total = Number(count ?? (data?.length ?? 0));

  return {
    rows: (data ?? []).map((r: any) => ({
      id: r.id,
      accountId: r.account_id ?? null,
      accountName: nameById.get(r.account_id) ?? "حساب محذوف",
      kind: r.kind,
      direction: r.direction === "in" ? "in" : "out",
      refId: r.ref_id,
      title: r.title || "—",
      amount: num(r.amount),
      currency: r.currency ?? "USD",
      fee: num(r.fee),
      status: r.status ?? "",
      time: new Date(r.occurred_at).getTime(),
      detail: (r.detail ?? {}) as Record<string, string | number | boolean | null>,
    })),
    total,
    page,
    pageSize,
    counts,
  };
}


/**
 * Same spend/fee rules as a single visa account, aggregated over every account
 * currently present in the system. Each account is summed with the shared spend
 * engine (identical to its own card), then the results are added together, so a
 * newly added account is included automatically and a removed one drops out.
 */

export async function listReversalCases() {
  const db = await admin();
  const { data, error } = await db.from("bybit_reversal_cases").select("account_id,event_id,candidate_ids,source")
    .eq("state", "needs_review").limit(100);
  if (error) throw new Error(error.message);
  const cases = [];
  for (const c of data ?? []) {
    const { data: rows, error: readError } = await db.from("bybit_card_txns")
      .select("txn_id,amount,txn_time,pan4,merchant,status,tradeStatus:detail->>tradeStatus,orderNo:detail->>orderNo")
      .eq("account_id", c.account_id).in("txn_id", [...c.candidate_ids, c.event_id]);
    if (readError) throw new Error(readError.message);
    cases.push({ ...c, rows: rows ?? [] });
  }
  return { cases };
}
