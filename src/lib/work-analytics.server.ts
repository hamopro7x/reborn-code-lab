import { isPastLastPage, pageRange } from "./pagination";
import { enforceRetentionSafe } from "./retention.server";
import { CARD_READ_FILTER } from "./bybit-confirmation";
import { readP2PLinks, P2P_SCHEMA_MESSAGE } from "./p2p-links.server";
import { readPages } from "./read-pages.server";
import { addWorkSummary, emptyWorkSummary } from "./work-summary";
import { cairoCalendarRange } from "./cairo-calendar";
import { admin, type DB } from "./work-db.server";
import { accountNames, namesFor, SUCCESS_STATUSES, dayKey, weekKey } from "./work-shared.server";

export async function currentShift() {
  const db = await admin();
  const { data } = await db
    .from("work_shifts")
    .select("*")
    .is("ended_at", null)
    .maybeSingle();
  if (!data) return null;
  const names = await namesFor(db, [data.user_id]);
  const { count } = await db
    .from("work_txn_assignments")
    .select("id", { count: "exact", head: true })
    .eq("shift_id", data.id);
  return {
    id: data.id as string,
    userId: data.user_id as string,
    name: names.get(data.user_id) ?? "موظف",
    startedAt: new Date(data.started_at).getTime(),
    endedAt: null as number | null,
    txns: Number(count ?? 0),
  };
}

export async function listShifts(limit = 60) {
  const db = await admin();
  const { data } = await db
    .from("work_shifts")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  const rows = data ?? [];
  const names = await namesFor(db, rows.map((r: any) => r.user_id));

  const ids = rows.map((r: any) => r.id);
  const tally = new Map<string, number>();
  if (ids.length) {
    const { data: asg } = await db.from("work_txn_assignments").select("shift_id").in("shift_id", ids);
    for (const a of asg ?? []) tally.set(a.shift_id, (tally.get(a.shift_id) ?? 0) + 1);
  }

  return rows.map((r: any) => ({
    id: r.id as string,
    userId: r.user_id as string,
    name: names.get(r.user_id) ?? "موظف",
    startedAt: new Date(r.started_at).getTime(),
    endedAt: r.ended_at ? new Date(r.ended_at).getTime() : null,
    endedReason: r.ended_reason ?? null,
    txns: tally.get(r.id) ?? 0,
  }));
}

/* ------------------------------ productivity ------------------------------ */

/**
 * Real productivity: every number is the count of actual assignment rows, so a
 * number can always be expanded into the transactions it is made of and older
 * days are never reset.
 */

export async function productivity(sinceMs: number) {
  const db = await admin();
  const q = db
    .from("work_txn_assignments")
    .select("id,user_id,occurred_at")
    .gte("occurred_at", new Date(sinceMs).toISOString())
    .order("id");
  const rows: any[] = [];
  await readPages<any>((from, to) => q.range(from, to), (page) => rows.push(...page));
  const names = await namesFor(db, rows.map((r: any) => r.user_id));

  const byUser = new Map<string, { days: Map<string, number>; weeks: Map<string, number>; total: number }>();
  for (const r of rows) {
    const t = new Date(r.occurred_at).getTime();
    let e = byUser.get(r.user_id);
    if (!e) byUser.set(r.user_id, (e = { days: new Map(), weeks: new Map(), total: 0 }));
    const d = dayKey(t);
    const w = weekKey(t);
    e.days.set(d, (e.days.get(d) ?? 0) + 1);
    e.weeks.set(w, (e.weeks.get(w) ?? 0) + 1);
    e.total += 1;
  }

  return [...byUser.entries()]
    .map(([userId, e]) => ({
      userId,
      name: names.get(userId) ?? "موظف",
      total: e.total,
      days: [...e.days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, count]) => ({ day, count })),
      weeks: [...e.weeks.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([week, count]) => ({ week, count })),
    }))
    .sort((a, b) => b.total - a.total);
}

/* ------------------------------ work table ------------------------------ */

export type WorkRow = {
  assignmentId: string;
  ledgerId: string;
  userId: string;
  name: string;
  shiftId: string | null;
  assignMode: string;
  assignedAt: number;
  kind: string;
  direction: "in" | "out";
  refId: string;
  title: string;
  amount: number;
  currency: string;
  fee: number;
  status: string;
  time: number;
  accountId: string | null;
  detail: Record<string, string | number | boolean | null>;
};

/**
 * The ONLY definition of a "successful" transaction used by «جدول بيانات الشغل».
 * These are the real status values stored in public.bybit_ledger
 * (card → success, on-chain/internal → ناجحة, P2P → اكتملت).
 * Anything else (failed / ملغاة / pending …) is never shown or counted in the
 * employee work data. The original rows are never modified or deleted.
 */

export async function workSheetSummary(shiftId: string) {
  const db = await admin();
  const summary = emptyWorkSummary();
  await readPages<any>((from, to) => db.from("work_txn_assignments")
    .select("id,bybit_ledger!inner(amount,work_txn_entries(egp,quantity))")
    .eq("shift_id", shiftId)
    .in("bybit_ledger.kind", ["card", "refund"])
    .in("bybit_ledger.status", SUCCESS_STATUSES as unknown as string[])
    .not("bybit_ledger.detail", "cs", '{"side":"2"}')
    .not("bybit_ledger.detail", "cs", '{"side":2}')
    .or(CARD_READ_FILTER, { referencedTable: "bybit_ledger" })
    .order("id", { ascending: true }).range(from, to),
    (rows) => rows.forEach((row) => addWorkSummary(summary, row.bybit_ledger ?? {})));
  const notes = await db.from("work_txn_assignments")
    .select("id,bybit_ledger!inner(work_transfer_notes!inner(ledger_id))", { count: "exact", head: true })
    .eq("shift_id", shiftId).in("bybit_ledger.kind", ["deposit", "withdraw"])
    .in("bybit_ledger.status", SUCCESS_STATUSES as unknown as string[])
    .not("bybit_ledger.work_transfer_notes.note", "is", null)
    .neq("bybit_ledger.work_transfer_notes.note", "");
  if (notes.error) throw new Error(notes.error.message);
  return { ...summary, externalNotes: Number(notes.count ?? 0) };
}

export async function workTable(opts: {
  userId?: string;
  shiftId?: string;
  day?: string;
  week?: string;
  page?: number;
  pageSize?: number;
  /** Employee work data layer: keep successful transactions only. */
  successOnly?: boolean;
  cardOnly?: boolean;
  kinds?: string[];
  direction?: "in" | "out";
}) {
  const db = await admin();
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 10), 200);
  const page = Math.max(opts.page ?? 1, 1);
  const from = (page - 1) * pageSize;

  let q: any = db
    .from("work_txn_assignments")
    .select("*, bybit_ledger!inner(*)", { count: "exact" })
    .not("bybit_ledger.detail", "cs", '{"side":"2"}')
    .not("bybit_ledger.detail", "cs", '{"side":2}')
    .or(`kind.not.in.(card,refund),${CARD_READ_FILTER}`, { referencedTable: "bybit_ledger" })
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false });

  if (opts.successOnly) q = q.in("bybit_ledger.status", SUCCESS_STATUSES as unknown as string[]);
  if (opts.cardOnly) q = q.in("bybit_ledger.kind", ["card", "refund"]);
  if (opts.kinds) q = q.in("bybit_ledger.kind", opts.kinds);
  if (opts.direction) q = q.eq("bybit_ledger.direction", opts.direction);


  if (opts.userId) q = q.eq("user_id", opts.userId);
  if (opts.shiftId) q = q.eq("shift_id", opts.shiftId);
  if (opts.day) {
    const bounds = cairoCalendarRange(opts.day);
    q = q.gte("occurred_at", bounds.start).lt("occurred_at", bounds.end);
  }
  if (opts.week) {
    const bounds = cairoCalendarRange(opts.week, 7);
    q = q.gte("occurred_at", bounds.start).lt("occurred_at", bounds.end);
  }

  const res = await q.range(from, from + pageSize - 1);
  let { data, error, count } = res;
  if (isPastLastPage(error)) {    // Page past the end after the list shrank: an empty page, not a failure.
    const head = await q.range(0, 0);
    if (head.error) throw new Error(head.error.message);
    data = [];
    error = null;
    count = head.count ?? 0;
  }  if (error) throw new Error(error.message);

  const rows: any[] = data ?? [];
  const [names, accounts] = await Promise.all([
    namesFor(db, rows.map((r: any) => r.user_id)),
    accountNames(db),
  ]);

  return {
    page,
    pageSize,
    total: Number(count ?? rows.length),
    rows: rows.map((r: any): WorkRow & { accountName: string } => {
      const l = r.bybit_ledger ?? {};
      return {
        assignmentId: r.id,
        ledgerId: r.ledger_id,
        userId: r.user_id,
        name: names.get(r.user_id) ?? "موظف",
        shiftId: r.shift_id ?? null,
        assignMode: r.assign_mode,
        assignedAt: new Date(r.assigned_at).getTime(),
        kind: l.kind ?? r.kind,
        direction: l.direction === "in" ? "in" : "out",
        refId: l.ref_id ?? "",
        title: l.title ?? "—",
        amount: Number(l.amount ?? 0),
        currency: l.currency ?? "USD",
        fee: Number(l.fee ?? 0),
        status: l.status ?? "",
        time: l.occurred_at ? new Date(l.occurred_at).getTime() : new Date(r.occurred_at).getTime(),
        accountId: l.account_id ?? null,
        accountName: accounts.get(l.account_id) ?? "—",
        detail: (l.detail ?? {}) as Record<string, string | number | boolean | null>,
      };
    }),
  };
}

/* ------------------------- P2P: manual linking ------------------------- */

/** Completed P2P orders that are not linked to any shift yet. */
