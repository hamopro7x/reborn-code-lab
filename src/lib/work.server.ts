/**
 * «جدول بيانات الشغل» — server layer.
 *
 * This module ONLY reads the original transaction data (public.bybit_ledger) and
 * writes only staff shift/assignment/input tables. It never modifies a
 * transaction's original fields. Historical biometric records remain untouched.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPastLastPage, pageRange } from "./pagination";
import { enforceRetentionSafe } from "./retention.server";
import { CARD_READ_FILTER } from "./bybit-confirmation";
import { readP2PLinks, P2P_SCHEMA_MESSAGE } from "./p2p-links.server";
import { readPages } from "./read-pages.server";
import { addWorkSummary, emptyWorkSummary } from "./work-summary";
import { cairoCalendarRange } from "./cairo-calendar";
import { hashPin } from "./pin-attempt.server";

type DB = SupabaseClient<any, any, any>;

async function admin(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}

const P2P_KINDS = ["p2p_buy", "p2p_sell"];

/* ------------------------------ helpers ------------------------------ */

/** Day key in Cairo time, so the daily/weekly report matches the working day. */
export function dayKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** Saturday-based week start (matches the weekly report example). */
export function weekKey(ms: number): string {
  const d = new Date(`${dayKey(ms)}T00:00:00Z`);
  const shift = (d.getUTCDay() + 1) % 7; // Sat = 0
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

async function namesFor(db: DB, ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const { data } = await db.from("profiles").select("id,full_name,email").in("id", uniq);
  return new Map((data ?? []).map((p: any) => [p.id, p.full_name || p.email || "موظف"]));
}

/* --------------------------- shifts / current --------------------------- */

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
export const SUCCESS_STATUSES = ["success", "ناجحة", "اكتملت"] as const;

/** Compact totals over the complete shift; provider detail stays on the paged row endpoint. */
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
  if (isPastLastPage(error)) {
    // Page past the end after the list shrank: an empty page, not a failure.
    const head = await q.range(0, 0);
    if (head.error) throw new Error(head.error.message);
    data = [];
    error = null;
    count = head.count ?? 0;
  }
  if (error) throw new Error(error.message);

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

async function accountNames(db: DB): Promise<Map<string, string>> {
  const { accountLabels } = await import("./account-labels.server");
  return accountLabels(db);
}

/* ------------------------- P2P: manual linking ------------------------- */

/** Completed P2P orders that are not linked to any shift yet. */
export async function pendingP2P(limit = 100) {
  const db = await admin();
  const { data: assigned } = await db.from("work_txn_assignments").select("ledger_id").in("kind", P2P_KINDS);
  const taken = new Set((assigned ?? []).map((a: any) => a.ledger_id));

  const { data } = await db
    .from("bybit_ledger")
    .select("*")
    .in("kind", P2P_KINDS)
    .order("occurred_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 300));

  const accounts = await accountNames(db);
  return (data ?? [])
    .filter((r: any) => !taken.has(r.id))
    .map((r: any) => ({
      ledgerId: r.id as string,
      kind: r.kind as string,
      refId: r.ref_id as string,
      title: r.title as string,
      amount: Number(r.amount ?? 0),
      currency: r.currency ?? "USDT",
      status: String(r.status ?? ""),
      time: new Date(r.occurred_at).getTime(),
      accountName: accounts.get(r.account_id) ?? "—",
      detail: (r.detail ?? {}) as Record<string, string | number | boolean | null>,
    }));
}

/**
 * Completed P2P orders of ALL Bybit accounts — shared with every employee.
 * Read-only: no shift/assignment filter, so any newly completed order shows up
 * for everybody in «طلبات P2P».
 */
export async function completedP2P(limit = 200, viewerId?: string, isAdmin = false) {
  const db = await admin();

  // Only orders that happened after the admin reset point are shown to employees.
  const { data: setting } = await db
    .from("site_settings")
    .select("value")
    .eq("key", "p2p_orders_cutoff")
    .maybeSingle();
  const cutoff = typeof (setting as any)?.value === "string" ? String((setting as any).value) : null;

  const max = Math.min(Math.max(limit, 1), 500);
  const data: any[] = [];
  const allLinks: Awaited<ReturnType<typeof readP2PLinks>> = [];
  let cursor: { time: string; id: string } | null = null;
  // Apply linked-order eligibility BEFORE the caller's explicit inbox size.
  // A linked newest page must never mask older unlinked orders.
  while (data.length < max) {
    let q = db.from("bybit_ledger").select("*").in("kind", P2P_KINDS).eq("status", "اكتملت")
      .order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(200);
    if (cutoff) q = q.gt("occurred_at", cutoff);
    if (cursor) q = q.or(`occurred_at.lt.${cursor.time},and(occurred_at.eq.${cursor.time},id.lt.${cursor.id})`);
    const result = await q;
    if (result.error) throw new Error("تعذر تحميل طلبات P2P. حاول مرة أخرى.");
    const candidates: any[] = result.data ?? [];
    const pageLinks = await readP2PLinks(db, { ledgerIds: candidates.map((r) => String(r.id)) });
    const taken = new Set(pageLinks.map((l) => l.ledger_id));
    data.push(...candidates.filter((r) => isAdmin || !taken.has(r.id)).slice(0, max - data.length));
    allLinks.push(...pageLinks);
    if (candidates.length < 200) break;
    const last = candidates.at(-1);
    if (!last?.occurred_at || !last.id) throw new Error("تعذر متابعة صفحات P2P.");
    if (cursor && cursor.time === last.occurred_at && cursor.id === last.id) throw new Error("تعذر متابعة صفحات P2P.");
    cursor = { time: last.occurred_at, id: last.id };
  }
  const links = allLinks.filter((l) => isAdmin || l.user_id === viewerId);
  const linkNames = await namesFor(db, links.map((l) => l.user_id));

  const accounts = await accountNames(db);
  return data.map((r: any) => ({
      ledgerId: r.id as string,
      kind: r.kind as string,
      refId: r.ref_id as string,
      title: r.title as string,
      amount: Number(r.amount ?? 0),
      currency: r.currency ?? "USDT",
      status: String(r.status ?? ""),
      time: new Date(r.occurred_at).getTime(),
      accountName: accounts.get(r.account_id) ?? "—",
      detail: (r.detail ?? {}) as Record<string, string | number | boolean | null>,
      relatedShifts: links.filter((l) => l.ledger_id === r.id).map((l) => ({
        shiftId: l.shift_id, userId: l.user_id, name: linkNames.get(l.user_id) ?? "موظف",
        startedAt: l.started_at ? new Date(l.started_at).getTime() : null,
        endedAt: l.ended_at ? new Date(l.ended_at).getTime() : null,
        legacyGroup: l.legacy_group, source: l.source,
      })),
    }));
}

/* ------------ external / internal deposits & withdrawals ------------ */
/**
 * READ-ONLY view over the SAME central ledger (public.bybit_ledger) used by
 * «معاملات الفيزا». Nothing is created, copied or modified here: the two
 * employee sections «الإيداع والسحب الخارجي» / «الداخلي» are pure filters on
 * the real transaction kind:
 *   external → deposit / withdraw   (on-chain)
 *   internal → internal_in / internal_out
 * Rows keep their original ledger id, account (visa), amount, time and status,
 * and are de-duplicated by that ledger id.
 */
export const TRANSFER_KINDS = {
  external: ["deposit", "withdraw"],
  internal: ["internal_in", "internal_out"],
} as const;

export async function transfersLedger(
  scope: "external" | "internal",
  limit = 200,
  sinceIso?: string | null,
) {
  const db = await admin();
  let q = db
    .from("bybit_ledger")
    .select("*")
    .in("kind", TRANSFER_KINDS[scope] as unknown as string[])
    .in("status", SUCCESS_STATUSES as unknown as string[]);
  // الموظف يرى الجديد فقط: ما حدث بعد بداية شفته الحالي.
  if (sinceIso) q = q.gte("occurred_at", sinceIso);
  const { data } = await q
    .order("occurred_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));

  const accounts = await accountNames(db);
  const seen = new Set<string>();
  const out: Array<{
    ledgerId: string;
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
    accountName: string;
    detail: Record<string, string | number | boolean | null>;
    note?: string | null;
    noteAt?: string | null;
  }> = [];
  for (const r of (data ?? []) as any[]) {
    const id = String(r.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      ledgerId: id,
      kind: String(r.kind),
      direction: r.direction === "in" ? "in" : "out",
      refId: String(r.ref_id ?? ""),
      title: String(r.title ?? "—"),
      amount: Number(r.amount ?? 0),
      currency: r.currency ?? "USDT",
      fee: Number(r.fee ?? 0),
      status: String(r.status ?? ""),
      time: new Date(r.occurred_at).getTime(),
      accountId: r.account_id ?? null,
      accountName: accounts.get(r.account_id) ?? "—",
      detail: (r.detail ?? {}) as Record<string, string | number | boolean | null>,
    });
  }

  // خانة «تحويل الي» التي يكتبها الموظف يدويًا (طبقة منفصلة، لا تلمس السجل الأصلي)
  if (scope === "external" && out.length) {
    const { data: notes } = await db
      .from("work_transfer_notes")
      .select("ledger_id,note,saved_at")
      .in(
        "ledger_id",
        out.map((r) => r.ledgerId),
      );
    const map = new Map((notes ?? []).map((n: any) => [String(n.ledger_id), n]));
    for (const r of out) {
      const n = map.get(r.ledgerId);
      r.note = n ? String((n as any).note ?? "") : null;
      r.noteAt = n ? ((n as any).saved_at ?? null) : null;
    }
  }
  return out;
}

/** حفظ خانة «تحويل الي» — قابلة للتعديل 10 دقائق من وقت الحفظ على السيرفر ثم تُقفل. */
export const NOTE_EDIT_WINDOW_MS = 10 * 60 * 1000;

/** تحويلات شفت الموظف المفتوح فقط (فاضي لو مفيش شفت). */
export async function myShiftTransfers(userId: string, scope: "external" | "internal") {
  const db = await admin();
  const { data } = await db
    .from("work_shifts")
    .select("id,user_id,started_at")
    .is("ended_at", null)
    .maybeSingle();
  if (!data || (data as any).user_id !== userId) return [];
  return transfersLedger(scope, 200, (data as any).started_at as string);
}

export async function saveTransferNote(userId: string, ledgerId: string, note: string) {
  const db = await admin();
  const text = String(note ?? "").trim().slice(0, 200);
  if (!text) return { ok: false as const, error: "اكتب قيمة أولًا" };

  const { data: led } = await db
    .from("bybit_ledger")
    .select("kind,status")
    .eq("id", ledgerId)
    .maybeSingle();
  if (!led || String((led as any).kind) !== "withdraw") {
    return { ok: false as const, error: "هذه الخانة خاصة بالسحب الخارجي فقط." };
  }
  if (!(SUCCESS_STATUSES as unknown as string[]).includes(String((led as any).status))) {
    return { ok: false as const, error: "هذه المعاملة غير ناجحة." };
  }

  const { data: existing } = await db
    .from("work_transfer_notes")
    .select("ledger_id,saved_at,user_id")
    .eq("ledger_id", ledgerId)
    .maybeSingle();

  if (existing && (existing as any).user_id && (existing as any).user_id !== userId) {
    const { data: roles } = await db.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) {
      return { ok: false as const, error: "هذه الملاحظة خاصة بموظف آخر." };
    }
  }

  const now = new Date();
  const savedAt = now.toISOString();
  if (existing) {
    const prev = (existing as any).saved_at as string | null;
    if (prev && now.getTime() - new Date(prev).getTime() >= NOTE_EDIT_WINDOW_MS) {
      return { ok: false as const, error: "انتهت مدة التعديل المسموحة لهذه الخانة.", locked: true as const };
    }
    const { error } = await db
      .from("work_transfer_notes")
      .update({ note: text, saved_at: prev ?? savedAt })
      .eq("ledger_id", ledgerId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, note: text, savedAt: prev ?? savedAt, serverNow: savedAt };
  }
  const { error } = await db
    .from("work_transfer_notes")
    .insert({ ledger_id: ledgerId, user_id: userId, note: text, saved_at: savedAt });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, note: text, savedAt, serverNow: savedAt };
}



/** Real staff list (admins + employees) used by the P2P «ربط» picker. */
export async function staffList() {
  const db = await admin();
  const { data: roles } = await db.from("user_roles").select("user_id,role").in("role", ["admin", "employee"]);
  const ids = [...new Set((roles ?? []).map((r: any) => r.user_id))];
  const names = await namesFor(db, ids);
  return ids
    .map((id) => ({ userId: id as string, name: names.get(id as string) ?? "موظف" }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** Shifts that belong to ONE employee only. */
export async function shiftsOfUser(userId: string, limit = 40) {
  const db = await admin();
  const { data, error } = await db
    .from("work_shifts")
    .select("id,user_id,started_at,ended_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new Error("تعذر تحميل الشفتات. حاول مرة أخرى.");
  return (data ?? []).map((r: any) => ({
    id: r.id as string,
    userId: r.user_id as string,
    startedAt: new Date(r.started_at).getTime(),
    endedAt: r.ended_at ? new Date(r.ended_at).getTime() : null,
  }));
}

/** Caller's own shifts + his display name — the P2P «ربط» picker source. */
export async function myShiftsForLink(userId: string, hiddenOnly = false) {
  const db = await admin();
  const names = await namesFor(db, [userId]);
  const hiddenIds = new Set<string>();
  const restoredIds = new Set<string>();
  // Read all hidden ids before filtering, so older shifts can still be restored.
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from("work_p2p_hidden_shifts").select("shift_id,hidden")
      .eq("user_id", userId).order("shift_id").range(from, from + 499);
    if (error) throw new Error(["42P01", "PGRST205"].includes(error.code) ? P2P_SCHEMA_MESSAGE : "تعذر تحميل الشفتات المخفية.");
    for (const r of data ?? []) (r.hidden ? hiddenIds : restoredIds).add(String(r.shift_id));
    if ((data ?? []).length < 500) break;
  }
  const legacyIds = new Set((await readP2PLinks(db, { userId }))
    .filter((l) => l.source === "legacy-assignment" && l.shift_id)
    .map((l) => l.shift_id));
  const shifts: { id: string; userId: string; startedAt: number; endedAt: number | null }[] = [];
  // Archived shifts are hidden from the admin history, so the picker must hide them too.
  let archiveColumn = true;
  for (let from = 0; ; from += 500) {
    const page = () => {
      let q = db.from("work_shifts").select(archiveColumn ? "id,user_id,started_at,ended_at,ended_reason,archived_at" : "id,user_id,started_at,ended_at,ended_reason")
        .eq("user_id", userId);
      if (archiveColumn) q = q.is("archived_at", null);
      return q.order("started_at", { ascending: false }).order("id").range(from, from + 499);
    };
    let { data, error } = await page() as { data: any[] | null; error: any };
    if (error?.code === "42703" && archiveColumn) { archiveColumn = false; ({ data, error } = await page() as { data: any[] | null; error: any }); }
    if (error) throw new Error("تعذر تحميل الشفتات. حاول مرة أخرى.");
    for (const s of data ?? []) {
      const id = String(s.id);
      // Preserve the old picker exclusions without consuming any new links.
      // Explicit restoration overrides historical visibility only for this owner.
      const legacyHidden = s.ended_at != null && !restoredIds.has(id)
        && (s.ended_reason === "p2p_used" || legacyIds.has(id));
      if ((hiddenIds.has(id) || legacyHidden) === hiddenOnly) shifts.push({
      id: String(s.id), userId, startedAt: new Date(s.started_at).getTime(),
      endedAt: s.ended_at ? new Date(s.ended_at).getTime() : null,
    });
    }
    if ((data ?? []).length < 500) break;
  }
  return {
    name: names.get(userId) ?? "موظف",
    shifts,
  };
}

/** All selected links are saved atomically; neither ledger nor shift state changes. */
export async function linkP2P(ledgerId: string, shiftIds: string[], actorId: string) {
  const db = await admin();
  const { data, error } = await db.rpc("work_link_p2p_many", {
    p_ledger_id: ledgerId,
    p_actor_id: actorId,
    p_shift_ids: [...new Set(shiftIds)],
  });
  if (error) {
    console.error("P2P atomic link failed", { code: error.code });
    return { ok: false as const, error: error.code === "PGRST202" || error.code === "42883"
      ? P2P_SCHEMA_MESSAGE
      : "تعذر حفظ الربط بالكامل. لم يتم تأكيد الربط؛ حاول مرة أخرى." };
  }
  if (data?.ok === true) return { ok: true as const };
  return { ok: false as const, error: typeof data?.error === "string" ? data.error : "تعذر تأكيد حفظ الربط." };
}

export async function setP2PShiftHidden(actorId: string, shiftId: string, hidden: boolean) {
  const db = await admin();
  const { data, error } = await db.rpc("work_set_p2p_shift_hidden", {
    p_actor_id: actorId, p_shift_id: shiftId, p_hidden: hidden,
  });
  if (error) return { ok: false as const, error: ["PGRST202", "42883"].includes(error.code)
    ? P2P_SCHEMA_MESSAGE : "تعذر حفظ إظهار أو إخفاء الشفت. حاول مرة أخرى." };
  if (data?.ok === true) return { ok: true as const };
  return { ok: false as const, error: data?.error ?? "تعذر تأكيد الحفظ." };
}

/** Shift options offered by the "ربط بالشفت" button. */
export async function shiftOptions(limit = 40) {
  const shifts = await listShifts(limit);
  return shifts.map((s) => ({
    id: s.id,
    userId: s.userId,
    name: s.name,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
  }));
}


/* ---------------------- employee-scoped (non-admin) ---------------------- */

/**
 * What an employee is allowed to know: only whether HE is currently holding the
 * work, and only for his own open shift. No other employee's name, shift
 * history, duration or productivity ever leaves the server for this call.
 */
export async function myWorkState(userId: string) {
  const db = await admin();
  const { data } = await db.from("work_shifts").select("id,user_id,started_at").is("ended_at", null).maybeSingle();
  if (!data || data.user_id !== userId) return { holding: false as const };
  // Successful transactions only — same rule as the rows shown below.
  const { count } = await db
    .from("work_txn_assignments")
    .select("id, bybit_ledger!inner(status)", { count: "exact", head: true })
    .not("bybit_ledger.detail", "cs", '{"side":"2"}')
    .not("bybit_ledger.detail", "cs", '{"side":2}')
    .or(`kind.not.in.(card,refund),${CARD_READ_FILTER}`, { referencedTable: "bybit_ledger" })
    .eq("shift_id", data.id)
    .in("bybit_ledger.status", SUCCESS_STATUSES as unknown as string[]);
  return {
    holding: true as const,
    shiftId: data.id as string,
    startedAt: new Date(data.started_at).getTime(),
    txns: Number(count ?? 0),
  };
}

/** Transactions of the caller's own OPEN shift only. Empty when he holds none. */
export async function myShiftRows(userId: string, page = 1, pageSize = 50) {
  const state = await myWorkState(userId);
  if (!state.holding) return { page: 1, pageSize, total: 0, rows: [] as any[], holding: false as const };
  const res = await workTable({ userId, shiftId: state.shiftId, page, pageSize, successOnly: true, cardOnly: true });

  const entries = await myEntries(res.rows.map((r: any) => r.ledgerId));
  const rows = res.rows.map((r: any) => {
    const e = entries.get(r.ledgerId);
    return {
      ...r,
      egp: e?.egp ?? null,
      quantity: e?.quantity ?? null,
      egpAt: e?.egpAt ?? null,
      quantityAt: e?.quantityAt ?? null,
    };
  });
  return { ...res, rows, ...state, serverNow: new Date().toISOString() };
}

/* ------------------------- admin view of one employee -------------------------
 * الأدمن يرى معاملات الموظف دائمًا — حتى لو الشفت شغّال الآن. نختار الشفت
 * الحالي المفتوح إن وُجد، وإلا آخر شفت فيه معاملات ناجحة. */

export async function adminEmployeeWorkState(userId: string) {
  const db = await admin();
  // شفت مفتوح + آخر الشفتات في نفس الوقت (بدل استعلامين متتاليين).
  const [openRes, recentRes] = await Promise.all([
    db.from("work_shifts").select("id").eq("user_id", userId).is("ended_at", null).maybeSingle(),
    db
      .from("work_shifts")
      .select("id,started_at,ended_at")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(20),
  ]);
  const live = !!openRes.data;

  const list = (recentRes.data ?? []) as any[];
  if (!list.length) return { holding: false as const, live };

  /**
   * عدّ المعاملات الناجحة لكل الشفتات في استعلام واحد بدل استعلام لكل شفت،
   * وهو ما كان يجعل فتح جدول بيانات الشغل بطيئًا جدًا (حتى 20 رحلة للسيرفر).
   */
  const { data: assigns } = await db
    .from("work_txn_assignments")
    .select("shift_id, bybit_ledger!inner(status)")
    .not("bybit_ledger.detail", "cs", '{"side":"2"}')
    .not("bybit_ledger.detail", "cs", '{"side":2}')
    .or(`kind.not.in.(card,refund),${CARD_READ_FILTER}`, { referencedTable: "bybit_ledger" })
    .in(
      "shift_id",
      list.map((s) => s.id),
    )
    .in("bybit_ledger.status", SUCCESS_STATUSES as unknown as string[]);

  const counts = new Map<string, number>();
  for (const a of (assigns ?? []) as any[]) {
    const id = String(a.shift_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  let picked: any = list[0];
  let pickedCount = 0;
  for (const s of list) {
    const c = counts.get(String(s.id)) ?? 0;
    if (c > 0) {
      picked = s;
      pickedCount = c;
      break;
    }
  }

  return {
    holding: true as const,
    live,
    shiftId: picked.id as string,
    startedAt: new Date(picked.started_at).getTime(),
    endedAt: picked.ended_at ? new Date(picked.ended_at).getTime() : null,
    txns: pickedCount,
  };

}


/** Rows of the employee's last CLOSED shift — تُعرض حتى لو عنده شفت شغّال. */
export async function adminEmployeeShiftRows(userId: string, page = 1, pageSize = 50) {
  const state = await adminEmployeeWorkState(userId);
  if (!state.holding)
    return {
      page: 1,
      pageSize,
      total: 0,
      rows: [] as any[],
      holding: false as const,
      live: state.live,
    };
  const res = await workTable({ userId, shiftId: state.shiftId, page, pageSize, successOnly: true, cardOnly: true });

  const entries = await myEntries(res.rows.map((r: any) => r.ledgerId));
  const rows = res.rows.map((r: any) => {
    const e = entries.get(r.ledgerId);
    return {
      ...r,
      egp: e?.egp ?? null,
      quantity: e?.quantity ?? null,
      egpAt: e?.egpAt ?? null,
      quantityAt: e?.quantityAt ?? null,
    };
  });
  return { ...res, rows, ...state, serverNow: new Date().toISOString() };
}

/* ------------------ employee-entered values (جنيه / الكمية) ------------------ */
/**
 * Employee-entered columns live in their own table (work_txn_entries) so the
 * original transaction row is never touched. A value stays editable for
 * EDIT_WINDOW_MS after the SERVER-side save time, then it is locked for good.
 */

/** Edit window for employee-entered values: 10 minutes, server-clock based. */
export const EDIT_WINDOW_MS = 5 * 60 * 1000;

export async function myEntries(ledgerIds: string[]) {
  if (!ledgerIds.length)
    return new Map<
      string,
      { egp: number | null; quantity: number | null; egpAt: string | null; quantityAt: string | null }
    >();
  const db = await admin();
  const { data } = await db
    .from("work_txn_entries")
    .select("ledger_id,egp,quantity,egp_at,quantity_at")
    .in("ledger_id", ledgerIds);
  const map = new Map<
    string,
    { egp: number | null; quantity: number | null; egpAt: string | null; quantityAt: string | null }
  >();
  for (const r of data ?? []) {
    map.set(r.ledger_id as string, {
      egp: r.egp === null || r.egp === undefined ? null : Number(r.egp),
      quantity: r.quantity === null || r.quantity === undefined ? null : Number(r.quantity),
      egpAt: (r as any).egp_at ?? null,
      quantityAt: (r as any).quantity_at ?? null,
    });
  }
  return map;
}

export async function saveEntryField(
  userId: string,
  ledgerId: string,
  field: "egp" | "quantity",
  value: number,
) {
  const db = await admin();

  // Successful transactions only: no «جنية»/«الكمية» on a failed transaction.
  const { data: led } = await db
    .from("bybit_ledger")
    .select("status")
    .eq("id", ledgerId)
    .maybeSingle();
  if (!led || !(SUCCESS_STATUSES as unknown as string[]).includes(String((led as any).status))) {
    return { ok: false as const, error: "هذه المعاملة غير ناجحة." };
  }



  // The transaction must belong to an assignment of the caller's OWN open shift.
  const state = await myWorkState(userId);
  if (!state.holding) return { ok: false as const, error: "لست مستلمًا للشغل حاليًا" };
  const { data: asg } = await db
    .from("work_txn_assignments")
    .select("ledger_id")
    .eq("ledger_id", ledgerId)
    .eq("shift_id", state.shiftId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!asg) return { ok: false as const, error: "المعاملة ليست ضمن شفتك" };

  const { data: existing } = await db
    .from("work_txn_entries")
    .select("ledger_id,egp,quantity,egp_at,quantity_at")
    .eq("ledger_id", ledgerId)
    .maybeSingle();

  const stampCol = field === "egp" ? "egp_at" : "quantity_at";
  const now = new Date();
  const savedAt = now.toISOString();

  if (existing) {
    const prevStamp = (existing as any)[stampCol] as string | null;
    const hasValue = (existing as any)[field] !== null && (existing as any)[field] !== undefined;
    if (hasValue && prevStamp && now.getTime() - new Date(prevStamp).getTime() >= EDIT_WINDOW_MS) {
      return {
        ok: false as const,
        error: "انتهت مدة التعديل المسموحة لهذه القيمة.",
        locked: true as const,
      };
    }
    const { error } = await db
      .from("work_txn_entries")
      .update({ [field]: value, [stampCol]: prevStamp ?? savedAt })
      .eq("ledger_id", ledgerId);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { error } = await db
      .from("work_txn_entries")
      .insert({ ledger_id: ledgerId, user_id: userId, [field]: value, [stampCol]: savedAt });
    if (error) return { ok: false as const, error: error.message };
  }
  return { ok: true as const, field, value, savedAt, serverNow: savedAt };
}


/* ---------------- manual rows: «المعاملات الغلط» / «خاص بالموظف» ---------------- */

export type ManualCard = "wrong" | "employee" | "receive" | "transfer";

/**
 * Manual rows are part of the SHIFT record: every row carries the shift it was
 * written during (`shift_id`). Passing a shift id returns that shift's history
 * only; ended shifts keep their rows for good (nothing is ever deleted).
 */
/** الصف الفاضي (بلا مبلغ وبلا تفاصيل) يُحذف بعد 5 دقائق من إنشائه — بشفت أو بدون. */
export const MANUAL_EMPTY_ROW_TTL_MS = 5 * 60 * 1000;

/**
 * تنظيف الصفوف الفاضية: أي صف لم يُكتب فيه أي قيمة (amount = null و details فاضي)
 * ومر على إنشائه أكثر من 5 دقائق يُحذف نهائيًا، حتى لو الموظف ماسك الشفت.
 * الصفوف التي فيها أي بيانات لا تُلمس إطلاقًا.
 */
export async function purgeEmptyManualTxns(userId?: string | null) {
  // Draft/empty rows are historical too; reads must never delete employee data.
}

export async function listManualTxns(
  userId: string,
  shiftId?: string | null,
  /** طبقة الصفحات الإضافية: بدونها يبقى السلوك القديم كما هو تمامًا. */
  paging?: { card?: ManualCard | null; page?: number; pageSize?: number; ascending?: boolean; visibleOpenShift?: string | null },
) {
  await purgeEmptyManualTxns(userId);
  const db = await admin();

  let q = db
    .from("work_manual_txns")
    .select("id,card,amount,details,created_at,amount_saved_at,details_saved_at,shift_id", { count: "exact" })
    .eq("user_id", userId);
  if (shiftId) q = q.eq("shift_id", shiftId);
  if (paging?.card) q = q.eq("card", paging.card);
  if (paging && "visibleOpenShift" in paging) {
    const since = new Date(Date.now() - MANUAL_NO_SHIFT_VISIBLE_MS).toISOString();
    if (paging.visibleOpenShift) q = q.or(`shift_id.eq.${paging.visibleOpenShift},and(shift_id.is.null,created_at.gte.${since})`);
    else q = q.is("shift_id", null).gte("created_at", since);
  }
  const asc = paging?.ascending === true;
  q = q.order("created_at", { ascending: asc }).order("id", { ascending: asc });
  const usePaging = !!paging && (paging.page !== undefined || paging.pageSize !== undefined);
  if (usePaging) {
    const { from, to } = pageRange(paging!.page, paging!.pageSize);
    q = q.range(from, to);
  }
  let data: any[] = [];
  let count: number | null = null;
  if (usePaging) {
    const result = await q;
    if (result.error) throw new Error(result.error.message);
    data = result.data ?? []; count = result.count;
  } else {
    await readPages<any>((from, to) => q.range(from, to), (rows) => data.push(...rows));
  }
  const r0 = pageRange(paging?.page, paging?.pageSize);
  return {
    serverNow: new Date().toISOString(),
    total: Number(count ?? (data ?? []).length),
    page: r0.page,
    pageSize: r0.pageSize,
    rows: (data ?? []).map((r: any) => ({
      id: r.id as string,
      card: r.card as ManualCard,
      amount: r.amount === null ? "" : String(r.amount),
      details: r.details ?? "",
      createdAt: r.created_at as string,
      shiftId: (r.shift_id ?? null) as string | null,
      amountSavedAt: (r.amount_saved_at ?? null) as string | null,
      detailsSavedAt: (r.details_saved_at ?? null) as string | null,
    })),
  };
}

/** The employee's currently OPEN shift id (null when he holds none). */
export async function openShiftId(userId: string): Promise<string | null> {
  const db = await admin();
  const { data, error } = await db
    .from("work_shifts")
    .select("id")
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();
  if (error) throw new Error("تعذّر قراءة الشفت الحالي — حاول مرة أخرى");
  return data ? ((data as any).id as string) : null;
}

/** المعاملات بدون شفت تظهر للموظف 10 دقائق فقط من وقت الإنشاء. */
export const MANUAL_NO_SHIFT_VISIBLE_MS = 10 * 60 * 1000;

/**
 * صفوف الموظف الظاهرة الآن: صفوف الشفت المفتوح (طوال الشفت) + الصفوف التي
 * أُنشئت بدون شفت خلال آخر 10 دقائق. لا شيء يُحذف من قاعدة البيانات.
 */
export async function listMyManualTxns(userId: string, paging?: { card?: ManualCard; page?: number }) {
  const shiftId = await openShiftId(userId);
  if (shiftId) {
    // صفوف اتسجلت قبل فتح الشفت بدقائق تتربط به بدل ما تختفي بعد 10 دقائق.
    const db = await admin();
    const since = new Date(Date.now() - MANUAL_NO_SHIFT_VISIBLE_MS).toISOString();
    try {
      await db
        .from("work_manual_txns")
        .update({ shift_id: shiftId })
        .eq("user_id", userId)
        .is("shift_id", null)
        .gte("created_at", since);
    } catch {
      /* الربط تحسين: فشله لا يوقف العرض. */
    }
  }
  return listManualTxns(userId, null, { ...paging, visibleOpenShift: shiftId });
}

/** الإضافة مسموحة دائمًا: بشفت مفتوح أو بدونه (shift_id = null، بلا شفت وهمي). */
export async function addManualTxn(userId: string, card: ManualCard) {
  const db = await admin();
  const shiftId = await openShiftId(userId);
  const { data, error } = await db
    .from("work_manual_txns")
    .insert({ user_id: userId, card, shift_id: shiftId })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  await enforceRetentionSafe("work_manual_txns");
  return { ok: true as const, id: data?.id as string };
}


export async function saveManualTxn(
  userId: string,
  id: string,
  field: "amount" | "details",
  value: string,
) {
  const db = await admin();
  const stampCol = field === "amount" ? "amount_saved_at" : "details_saved_at";

  const { data: row } = await db
    .from("work_manual_txns")
    .select("id,amount,details,created_at,amount_saved_at,details_saved_at,shift_id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return { ok: false as const, error: "الصف غير موجود" };

  // نافذة التعديل = 5 دقائق من created_at المحفوظ في قاعدة البيانات (ساعة السيرفر).
  const createdAt = (row as any).created_at as string;
  const now = new Date();
  if (now.getTime() - new Date(createdAt).getTime() >= EDIT_WINDOW_MS) {
    return {
      ok: false as const,
      error: "انتهت مدة التعديل المسموحة لهذه المعاملة.",
      locked: true as const,
      savedAt: createdAt,
      serverNow: now.toISOString(),
    };
  }


  const savedAt = now.toISOString();
  let patch: Record<string, unknown>;
  if (field === "amount") {
    // Lenient parsing: Arabic-Indic digits, thousand separators, stray symbols.
    const norm = String(value)
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[\u066b\u060c,]/g, ".")
      .replace(/[^\d.\-]/g, "")
      .trim();
    const n = Number(norm);
    patch = { amount: norm === "" || !Number.isFinite(n) ? null : n };
  } else {
    patch = { details: value };
  }
  // الطابع الزمني للحفظ يُحدَّث مع كل تعديل؛ الغلق يعتمد على created_at فقط.
  const hasValue = field === "amount" ? patch["amount"] !== null : String(value).trim() !== "";
  patch[stampCol] = hasValue ? savedAt : null;
  // صف اتعمل قبل فتح الشفت: يتربط بالشفت المفتوح عشان يظهر للأدمن في مراجعة الشفت.
  if (!(row as any).shift_id) {
    const open = await openShiftId(userId);
    if (open) patch["shift_id"] = open;
  }


  const { error } = await db.from("work_manual_txns").update(patch).eq("id", id).eq("user_id", userId);
  if (error) return { ok: false as const, error: error.message };
  return {
    ok: true as const,
    savedAt: (patch[stampCol] ?? null) as string | null,
    serverNow: savedAt,
  };
}


/**
 * Admin-only: clear one card of the CURRENT shift only — closed shifts keep
 * their historical rows.
 */
export async function clearManualTxns(userId: string, card: ManualCard) {
  const db = await admin();
  const shiftId = await openShiftId(userId);
  if (!shiftId) return { ok: true as const };
  const { error } = await db
    .from("work_manual_txns")
    .delete()
    .eq("user_id", userId)
    .eq("card", card)
    .eq("shift_id", shiftId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/* ============ «معاملة يدوية» داخل قسم المعاملات (الموظف فقط) ============
 * سجل مستقل تمامًا عن معاملات الـAPI (bybit_ledger لا يُلمس أبدًا).
 * القواعد كلها على السيرفر: يجب وجود شفت مفتوح للإنشاء، والتعديل مسموح
 * 10 دقائق من وقت الإنشاء (created_at) فقط، ولا حذف نهائيًا للموظف. */

export const MANUAL_CARD_EDIT_MS = 10 * 60 * 1000;

type ManualCardRow = {
  id: string;
  merchant: string;
  amount: string;
  egp: string;
  quantity: string;
  pan4: string;
  createdAt: string;
};

function mapManualCard(r: any): ManualCardRow {
  return {
    id: r.id as string,
    merchant: r.merchant ?? "",
    amount: r.amount === null || r.amount === undefined ? "" : String(r.amount),
    egp: r.egp === null || r.egp === undefined ? "" : String(r.egp),
    quantity: r.quantity === null || r.quantity === undefined ? "" : String(r.quantity),
    pan4: r.pan4 ?? "",
    createdAt: r.created_at as string,
  };
}

/** صفوف المعاملات اليدوية لشفت محدد (أو الشفت المفتوح للموظف). */
export async function listManualCardTxns(userId: string, shiftId: string) {
  const db = await admin();
  const q = db
    .from("work_manual_card_txns")
    .select("id,merchant,amount,egp,quantity,pan4,created_at")
    .eq("user_id", userId)
    .eq("shift_id", shiftId)
    .order("created_at", { ascending: false }).order("id", { ascending: false });
  const data: any[] = [];
  await readPages<any>((from, to) => q.range(from, to), (rows) => data.push(...rows));
  return {
    serverNow: new Date().toISOString(),
    editWindowMs: MANUAL_CARD_EDIT_MS,
    rows: (data ?? []).map(mapManualCard),
  };
}


export async function listMyManualCardTxns(userId: string) {
  const shiftId = await openShiftId(userId);
  if (!shiftId)
    return { serverNow: new Date().toISOString(), editWindowMs: MANUAL_CARD_EDIT_MS, rows: [] as ManualCardRow[] };
  return listManualCardTxns(userId, shiftId);
}

function parseNum(value: string) {
  const norm = String(value ?? "")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u066b\u060c,]/g, ".")
    .replace(/[^\d.\-]/g, "")
    .trim();
  if (norm === "") return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** الإنشاء: مرفوض تمامًا بدون شفت مفتوح — التحقق هنا وليس في الواجهة. */
export async function addMyManualCardTxn(
  userId: string,
  input: { merchant: string; amount: string; egp?: string; quantity: string; pan4: string },
) {
  const shiftId = await openShiftId(userId);
  if (!shiftId) {
    return { ok: false as const, error: "يجب فتح شفت أولًا لإضافة معاملة يدوية." };
  }
  const db = await admin();
  const { data, error } = await db
    .from("work_manual_card_txns")
    .insert({
      user_id: userId,
      shift_id: shiftId,
      merchant: String(input.merchant ?? "").trim(),
      amount: parseNum(input.amount),
      egp: parseNum(input.egp ?? ""),
      quantity: parseNum(input.quantity),
      pan4: String(input.pan4 ?? "").trim() || null,
    })
    .select("id,merchant,amount,egp,quantity,pan4,created_at")
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  await enforceRetentionSafe("work_manual_card_txns");
  return { ok: true as const, row: mapManualCard(data), serverNow: new Date().toISOString() };
}

/** التعديل: 10 دقائق من وقت الإنشاء المحفوظ في قاعدة البيانات (ساعة السيرفر). */
export async function saveMyManualCardTxn(
  userId: string,
  id: string,
  field: "merchant" | "amount" | "egp" | "quantity" | "pan4",
  value: string,
) {

  const db = await admin();
  const { data: row } = await db
    .from("work_manual_card_txns")
    .select("id,created_at,shift_id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return { ok: false as const, error: "الصف غير موجود" };

  const now = new Date();
  // كل الخانات (بما فيها «جنية») متاحة للتعديل 10 دقائق فقط.
  if (now.getTime() - new Date((row as any).created_at).getTime() >= MANUAL_CARD_EDIT_MS) {
    return {
      ok: false as const,
      locked: true as const,
      error: "انتهت مدة التعديل المسموحة (10 دقائق).",
      serverNow: now.toISOString(),
    };
  }

  const patch: Record<string, unknown> =
    field === "merchant"
      ? { merchant: String(value).trim() }
      : field === "pan4"
        ? { pan4: String(value).trim() || null }
        : { [field]: parseNum(value) };

  const { error } = await db
    .from("work_manual_card_txns")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, serverNow: now.toISOString() };
}

/* ======================= shift-scoped history (admin) =======================
 * كل شفت سجل مستقل: نفس مصادر البيانات المستخدمة عند الموظف، لكن مفلترة
 * بمعرّف الشفت الحقيقي (work_txn_assignments.shift_id / work_manual_txns.shift_id)
 * وليس بالوقت — لذلك طلب P2P الذي تم ربطه بعد إغلاق الشفت يظل داخل شفته.
 * قراءة فقط: لا يُحذف ولا يُعدّل أي سجل قديم. */

/** شفتات موظف واحد + عدد المعاملات الناجحة المرتبطة بكل شفت. */
export async function shiftHistory(userId: string, limit = 100, archivedOnly = false) {
  const db = await admin();
  const readShifts = (columns: string, filterArchived: boolean) => {
    let q = db.from("work_shifts").select(columns)
      .eq("user_id", userId).order("started_at", { ascending: false }).order("id", { ascending: false });
    // الشفتات المؤرشفة تختفي من القوائم بدون حذف أي سجل.
    if (filterArchived) {
      q = archivedOnly ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    }
    return q;
  };
  const data: any[] = [];
  // The selector's array contract includes global numbering/colours; bounded server pages preserve it.
  for (let from = 0; ; from += 200) {
    let result = await readShifts("id,started_at,ended_at,ended_reason,reviewed_at,link_group", true).range(from, from + 199);
    if (result.error?.code === "42703") {
      result = await readShifts("id,started_at,ended_at,ended_reason,reviewed_at", false).range(from, from + 199);
      if (archivedOnly && !result.error) return [];
    }
    if (result.error) throw new Error("تعذر تحميل سجل الشفتات. حاول مرة أخرى.");
    data.push(...(result.data ?? []));
    if ((result.data ?? []).length < 200) break;
  }

  const shifts = (data ?? []) as any[];
  const ids = shifts.map((s) => String(s.id));
  const tally = new Map<string, number>();
  const p2pLinks = ids.length ? await readP2PLinks(db, { shiftIds: ids, userId }) : [];
  const p2pIds = [...new Set(p2pLinks.map((l) => l.ledger_id))];
  const successfulP2P = new Set<string>();
  for (let from = 0; from < p2pIds.length; from += 100) {
    const result = await db.from("bybit_ledger").select("id").in("id", p2pIds.slice(from, from + 100))
      .in("status", SUCCESS_STATUSES as unknown as string[]);
    if (result.error) throw new Error("تعذر تحميل روابط الشفتات.");
    for (const row of result.data ?? []) successfulP2P.add(String(row.id));
  }
  for (let index = 0; index < ids.length; index += 100) {
    const q = db
      .from("work_txn_assignments")
      .select("id,shift_id, bybit_ledger!inner(status)")
      .not("bybit_ledger.detail", "cs", '{"side":"2"}')
      .not("bybit_ledger.detail", "cs", '{"side":2}')
      .or(`kind.not.in.(card,refund),${CARD_READ_FILTER}`, { referencedTable: "bybit_ledger" })
      .in("shift_id", ids.slice(index, index + 100))
      .not("kind", "in", "(p2p_buy,p2p_sell)")
      .in("bybit_ledger.status", SUCCESS_STATUSES as unknown as string[]).order("id");
    await readPages<any>((from, to) => q.range(from, to), (rows) => {
      for (const a of rows) {
        const k = String(a.shift_id);
        tally.set(k, (tally.get(k) ?? 0) + 1);
      }
    });
  }
  for (const link of p2pLinks) if (link.shift_id && successfulP2P.has(link.ledger_id)) {
    tally.set(link.shift_id, (tally.get(link.shift_id) ?? 0) + 1);
  }

  return shifts.map((s) => ({
    id: String(s.id),
    startedAt: new Date(s.started_at).getTime(),
    endedAt: s.ended_at ? new Date(s.ended_at).getTime() : null,
    endedReason: (s.ended_reason ?? null) as string | null,
    open: !s.ended_at,
    txns: tally.get(String(s.id)) ?? 0,
    reviewed: !!s.reviewed_at,
    // مجموعة الربط — الشفتات اللي اتربطو بنفس طلب P2P تحمل نفس المعرف.
    linkGroup: (s.link_group ?? null) as string | null,
    p2pOrderIds: p2pLinks.filter((l) => l.shift_id === String(s.id)).map((l) => l.ledger_id),
  }));
}

/** تعليم شفت بأنه تمت مراجعته — يُحفظ في قاعدة البيانات ولا يُمسح أبدًا. */
export async function markShiftReviewed(shiftId: string, reviewedBy: string) {
  const db = await admin();
  const patch = { reviewed_at: new Date().toISOString(), reviewed_by: reviewedBy } as any;
  const { error } = await db.from("work_shifts").update(patch).eq("id", shiftId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** أرشفة شفتات منتهية — تختفي من القوائم بدون حذف أي سجل. الشفت المفتوح لا يُؤرشف. */
export async function archiveShifts(shiftIds: string[]) {
  const db = await admin();
  const { data, error } = await db
    .from("work_shifts")
    .update({ archived_at: new Date().toISOString() } as any)
    .in("id", shiftIds)
    .not("ended_at", "is", null)
    .is("archived_at", null)
    .select("id");
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, archived: (data ?? []).length };
}

/** يتحقق أن الشفت يخص الموظف المطلوب (حماية ضد خلط بيانات الموظفين). */
async function shiftOwner(shiftId: string): Promise<string | null> {
  const db = await admin();
  const { data } = await db.from("work_shifts").select("user_id").eq("id", shiftId).maybeSingle();
  return data ? String((data as any).user_id) : null;
}

/** معاملات شفت معيّن (نفس شكل صفوف الموظف بالضبط). */
export async function shiftRows(shiftId: string, page = 1, pageSize = 50) {
  const userId = await shiftOwner(shiftId);
  if (!userId) return { page: 1, pageSize, total: 0, rows: [] as any[], holding: false as const };
  const res = await workTable({ userId, shiftId, page, pageSize, successOnly: true, cardOnly: true });
  const entries = await myEntries(res.rows.map((r: any) => r.ledgerId));
  const rows = res.rows.map((r: any) => {
    const e = entries.get(r.ledgerId);
    return {
      ...r,
      egp: e?.egp ?? null,
      quantity: e?.quantity ?? null,
      egpAt: e?.egpAt ?? null,
      quantityAt: e?.quantityAt ?? null,
    };
  });
  return { ...res, rows, holding: true as const, serverNow: new Date().toISOString() };
}

/** السجلات اليدوية (الغلط / خاص بالموظف / الاستلام / التحويل) لشفت معيّن. */
export async function shiftManualTxns(shiftId: string, paging?: { card?: ManualCard; page?: number }) {
  const userId = await shiftOwner(shiftId);
  if (!userId) return { serverNow: new Date().toISOString(), total: 0, ...pageRange(paging?.page), rows: [] as any[] };
  return listManualTxns(userId, shiftId, paging);
}

/** الإيداع والسحب الخارجي / الداخلي — بحسب شفت واحد أو كل شفتات موظف. */
async function transfersByAssignment(
  where: { shiftId?: string; userId?: string },
  scope: "external" | "internal",
) {
  const db = await admin();
  let q: any = db
    .from("work_txn_assignments")
    .select("id, ledger_id, bybit_ledger!inner(*)")
    .in("bybit_ledger.kind", TRANSFER_KINDS[scope] as unknown as string[])
    .in("bybit_ledger.status", SUCCESS_STATUSES as unknown as string[]);
  if (where.shiftId) q = q.eq("shift_id", where.shiftId);
  if (where.userId) q = q.eq("user_id", where.userId);
  const data: any[] = [];
  q = q.order("id", { ascending: false });
  await readPages<any>((from, to) => q.range(from, to), (rows) => data.push(...rows));


  const accounts = await accountNames(db);
  const seen = new Set<string>();
  const out: any[] = [];
  for (const a of (data ?? []) as any[]) {
    const r = a.bybit_ledger ?? {};
    const id = String(r.id ?? a.ledger_id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      ledgerId: id,
      kind: String(r.kind),
      direction: r.direction === "in" ? "in" : "out",
      refId: String(r.ref_id ?? ""),
      title: String(r.title ?? "—"),
      amount: Number(r.amount ?? 0),
      currency: r.currency ?? "USDT",
      fee: Number(r.fee ?? 0),
      status: String(r.status ?? ""),
      time: r.occurred_at ? new Date(r.occurred_at).getTime() : 0,
      accountId: r.account_id ?? null,
      accountName: accounts.get(r.account_id) ?? "—",
      detail: (r.detail ?? {}) as Record<string, string | number | boolean | null>,
      note: null as string | null,
      noteAt: null as string | null,
    });
  }
  out.sort((a, b) => b.time - a.time);

  if (scope === "external" && out.length) {
    const { data: notes } = await db
      .from("work_transfer_notes")
      .select("ledger_id,note,saved_at")
      .in("ledger_id", out.map((r) => r.ledgerId));
    const map = new Map((notes ?? []).map((n: any) => [String(n.ledger_id), n]));
    for (const r of out) {
      const n = map.get(r.ledgerId);
      r.note = n ? String((n as any).note ?? "") : null;
      r.noteAt = n ? ((n as any).saved_at ?? null) : null;
    }
  }
  return out;
}

/** الإيداع والسحب الخارجي / الداخلي المرتبط بشفت معيّن (نفس شكل صفوف الموظف). */
export async function shiftTransfers(shiftId: string, scope: "external" | "internal") {
  return transfersByAssignment({ shiftId }, scope);
}

/** Interactive transfer table: filter BEFORE pagination, retaining exact totals. */
export async function workTransferPage(userId: string, scope: "external" | "internal", direction: "in" | "out", page: number, shiftId?: string) {
  const resolvedShift = shiftId ?? await openShiftId(userId);
  if (!resolvedShift) return { page, pageSize: 50, total: 0, rows: [] };
  const result = await workTable({ shiftId: resolvedShift, kinds: [...TRANSFER_KINDS[scope]], direction, successOnly: true, page, pageSize: 50 });
  const db = await admin();
  const notes = new Map<string, { note: string; saved_at: string }>();
  if (scope === "external" && result.rows.length) {
    const response = await db.from("work_transfer_notes").select("ledger_id,note,saved_at").in("ledger_id", result.rows.map((r) => r.ledgerId));
    if (response.error) throw new Error(response.error.message);
    for (const row of response.data ?? []) notes.set(row.ledger_id, row);
  }
  return { ...result, rows: result.rows.map((row) => ({ ...row, note: notes.get(row.ledgerId)?.note ?? null, noteAt: notes.get(row.ledgerId)?.saved_at ?? null })) };
}

/**
 * طلبات P2P المرتبطة بشفت معيّن أو بكل شفتات موظف — المرجع هو الربط الفعلي
 * (shift_id/user_id) وليس وقت وصول الطلب.
 */
async function p2pByAssignment(where: { shiftId?: string; userId?: string }, viewerId?: string) {
  const db = await admin();
  const links = await readP2PLinks(db, { ...where, ...(viewerId ? { userId: viewerId } : {}) });
  const ledgerIds = [...new Set(links.map((l) => l.ledger_id))];
  if (!ledgerIds.length) return [];
  const allLinks = await readP2PLinks(db, { ledgerIds, ...(viewerId ? { userId: viewerId } : {}) });
  const names = await namesFor(db, allLinks.map((l) => l.user_id));
  const data: any[] = [];
  for (let from = 0; from < ledgerIds.length; from += 100) {
    const result = await db.from("bybit_ledger").select("*").in("kind", P2P_KINDS)
      .in("id", ledgerIds.slice(from, from + 100));
    if (result.error) throw new Error("تعذر تحميل طلبات P2P المرتبطة.");
    data.push(...(result.data ?? []));
  }

  const accounts = await accountNames(db);
  const seen = new Set<string>();
  const out: any[] = [];
  for (const r of data) {
    const id = String(r.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      assignmentId: links.find((l) => l.ledger_id === id)?.id ?? id,
      ledgerId: id,
      kind: String(r.kind ?? ""),
      refId: String(r.ref_id ?? ""),
      title: String(r.title ?? "—"),
      amount: Number(r.amount ?? 0),
      currency: r.currency ?? "USDT",
      status: String(r.status ?? ""),
      time: r.occurred_at ? new Date(r.occurred_at).getTime() : 0,
      accountName: accounts.get(r.account_id) ?? "—",
      detail: (r.detail ?? {}) as Record<string, string | number | boolean | null>,
      relatedShifts: allLinks.filter((l) => l.ledger_id === id).map((l) => ({
        shiftId: l.shift_id, userId: l.user_id, name: names.get(l.user_id) ?? "موظف",
        startedAt: l.started_at ? new Date(l.started_at).getTime() : null,
        endedAt: l.ended_at ? new Date(l.ended_at).getTime() : null,
        source: l.source, legacyGroup: l.legacy_group,
      })),
    });
  }
  return out.sort((a, b) => b.time - a.time);
}

export async function shiftP2P(shiftId: string, viewerId?: string) {
  return p2pByAssignment({ shiftId }, viewerId);
}

export async function p2pOrderLinks(ledgerId: string, viewerId?: string) {
  const db = await admin();
  const links = await readP2PLinks(db, { ledgerIds: [ledgerId], ...(viewerId ? { userId: viewerId } : {}) });
  const names = await namesFor(db, links.map((l) => l.user_id));
  return links.map((l) => ({
    shiftId: l.shift_id, userId: l.user_id, name: names.get(l.user_id) ?? "موظف",
    startedAt: l.started_at ? new Date(l.started_at).getTime() : null,
    legacyGroup: l.legacy_group, source: l.source,
  }));
}


/** طلبات P2P المرتبطة بالشفت المفتوح للموظف الحالي فقط. */
export async function myShiftP2P(userId: string) {
  const db = await admin();
  const { data } = await db
    .from("work_shifts")
    .select("id")
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();
  if (!data) return [];
  return shiftP2P(data.id as string, userId);
}

/** طلبات P2P المرتبطة بآخر شفت منتهي للموظف المختار (للأدمن). */
export async function adminEmployeeShiftP2P(userId: string) {
  const state = await adminEmployeeWorkState(userId);
  if (!state.holding) return [];
  return shiftP2P(state.shiftId);
}

/* ==================== أرشيف كامل: كل شفتات الموظف ====================
 * قسم «ملخص الشفت» في لوحة الأدمن: نفس مصادر البيانات المستخدمة في الأقسام
 * الأصلية (بلا مصدر موازٍ)، لكن بحسب الموظف كله بدل شفت واحد. القراءة فقط،
 * والترتيب داخل كل قسم من الأقدم إلى الأحدث، وبلا تكرار (مفتاح فريد لكل صف).
 */
export async function employeeArchive(
  userId: string,
  /** صفحات السجلات اليدوية فقط — باقي الأقسام كما هي بدون تغيير. */
  manualPaging?: { card?: ManualCard | null; page?: number; pageSize?: number },
) {
  const asc = (a: { time: number }, b: { time: number }) => a.time - b.time;

  // 1) المعاملات (فيزا) — كل الشفتات، مع صفحات متتابعة حتى نهاية السجل.
  const apiRows: any[] = [];
  for (let page = 1; ; page++) {
    const res = await workTable({ userId, page, pageSize: 200, successOnly: true });
    apiRows.push(...res.rows);
    if (apiRows.length >= res.total || res.rows.length === 0) break;
  }
  const entries = await myEntries(apiRows.map((r) => r.ledgerId));
  const seenLedger = new Set<string>();
  const cardTxns = apiRows
    .filter((r) => {
      const k = String(r.ledgerId);
      if (seenLedger.has(k)) return false;
      seenLedger.add(k);
      return /^(card|refund)$/i.test(String(r.kind ?? ""));
    })
    .map((r) => {
      const e = entries.get(r.ledgerId);
      return {
        ...r,
        egp: e?.egp ?? null,
        quantity: e?.quantity ?? null,
        egpAt: e?.egpAt ?? null,
        quantityAt: e?.quantityAt ?? null,
      };
    });

  // 2) المعاملات اليدوية داخل قسم المعاملات — كل الشفتات.
  const db = await admin();
  const { data: manualCard } = await db
    .from("work_manual_card_txns")
    .select("id,merchant,amount,egp,quantity,pan4,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const manualCardRows = (manualCard ?? []).map((r: any) => ({
    ...mapManualCard(r),
    __manual: true as const,
    time: new Date(r.created_at).getTime(),
  }));

  const txns = [...cardTxns, ...manualCardRows].sort(asc);

  // 3/4) التحويلات الخارجية والداخلية — كل الشفتات.
  const [ext, int] = await Promise.all([
    transfersByAssignment({ userId }, "external"),
    transfersByAssignment({ userId }, "internal"),
  ]);

  // 5) السجلات اليدوية (الغلط / خاص بالموظف / الاستلام / التحويل) — كل الشفتات.
  const manual = await listManualTxns(
    userId,
    null,
    manualPaging ? { ...manualPaging, ascending: true } : undefined,
  );

  // 6) طلبات P2P — كل الشفتات.
  const p2p = await p2pByAssignment({ userId });

  return {
    serverNow: new Date().toISOString(),
    editWindowMs: MANUAL_CARD_EDIT_MS,
    txns,
    ext: [...ext].sort(asc),
    int: [...int].sort(asc),
    manual: {
      serverNow: manual.serverNow,
      total: manual.total,
      page: manual.page,
      pageSize: manual.pageSize,
      rows: [...manual.rows].sort(
        (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    },
    p2p: [...p2p].sort(asc),
  };
}

/**
 * حذف شفت كامل (أدمن فقط). يحذف الروابط والسجلات اليدوية التابعة للشفت أولًا
 * حتى لا تفشل قيود المفاتيح الأجنبية. سجل Bybit الأصلي لا يُلمس إطلاقًا:
 * المعاملات المربوطة تعود «غير مربوطة» فقط.
 */
export async function deleteManualTxnRow(id: string) {
  const db = await admin();
  const { error } = await db.from("work_manual_txns").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deleteShift(shiftId: string) {
  const db = await admin();

  // طلبات P2P: نفصل الرابط عن الشفت فقط (shift_id = NULL) ونُبقي صف الربط
  // نفسه، حتى لا تعود الطلبات للظهور كطلبات متاحة بعد حذف الشفت.
  // لا نغيّر assign_mode حتى لا نعتمد على قيود قاعدة بيانات قد تختلف.
  const { error: pErr } = await db
    .from("work_txn_assignments")
    .update({ shift_id: null })
    .eq("shift_id", shiftId)
    .in("kind", P2P_KINDS as unknown as string[]);
  if (pErr) throw new Error(pErr.message);



  await db
    .from("work_txn_assignments")
    .delete()
    .eq("shift_id", shiftId)
    .not("kind", "in", `(${P2P_KINDS.join(",")})`);
  await db.from("work_manual_card_txns").delete().eq("shift_id", shiftId);
  await db.from("work_manual_txns").delete().eq("shift_id", shiftId);
  const { error } = await db.from("work_shifts").delete().eq("id", shiftId);
  if (error) throw new Error(error.message);
  return { ok: true };
}


/** المعاملات اليدوية لشفت معيّن (أدمن — قراءة فقط). */
export async function shiftManualCardTxns(shiftId: string) {
  const userId = await shiftOwner(shiftId);
  if (!userId)
    return { serverNow: new Date().toISOString(), editWindowMs: MANUAL_CARD_EDIT_MS, rows: [] as ManualCardRow[] };
  return listManualCardTxns(userId, shiftId);
}

/** كل المعاملات اليدوية لموظف معيّن (كل الشفتات) — أدمن، قراءة فقط. */
export async function employeeManualCardTxns(userId: string) {
  const db = await admin();
  const q = db
    .from("work_manual_card_txns")
    .select("id,merchant,amount,egp,quantity,pan4,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false }).order("id", { ascending: false });
  const data: any[] = [];
  await readPages<any>((from, to) => q.range(from, to), (page) => data.push(...page));
  return {
    serverNow: new Date().toISOString(),
    editWindowMs: MANUAL_CARD_EDIT_MS,
    rows: (data ?? []).map(mapManualCard),
  };
}

/* ------------------------------ employee PIN ------------------------------ */
/**
 * Shift handover is gated by a 6-digit PIN instead of face matching.
 * The PIN is never stored in clear text: a random per-user salt plus SHA-256
 * is kept in `work_pins`, which is reachable only through the service role.
 */

const PIN_RE = /^\d{6}$/;

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pinIsSet(userId: string): Promise<boolean> {
  const db = await admin();
  const { data, error } = await db.from("work_pins").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("تعذّر التحقق من رمز الاستلام — حاول مرة أخرى");
  return !!data;
}

/** Creates or replaces a PIN. `by` records who changed it (self or admin). */
export async function savePin(userId: string, pin: string, by: string, createOnly = false) {
  if (!PIN_RE.test(pin)) return { ok: false as const, error: "الرمز يجب أن يكون 6 أرقام" };
  const salt = randomSalt();
  const db = await admin();
  const row = {
      user_id: userId,
      pin_hash: await hashPin(pin, salt),
      pin_salt: salt,
      fail_count: 0,
      locked_until: null,
      set_by: by,
    };
  const { error } = createOnly
    ? await db.from("work_pins").insert(row)
    : await db.from("work_pins").upsert(row, { onConflict: "user_id" });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function clearPin(userId: string) {
  const db = await admin();
  const { error } = await db.from("work_pins").delete().eq("user_id", userId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Verifies a PIN, with a short lockout after 5 wrong tries. */
export async function verifyPin(userId: string, pin: string): Promise<{ ok: boolean; reason?: string }> {
  const { verifyPinAttempt } = await import("./pin-attempt.server");
  return verifyPinAttempt(await admin(), userId, pin);
}

/* شفت تمت مشاركته من الأدمن مع موظف — site_settings.shared_shifts = { userId: shiftId } */
async function readSharedShifts(): Promise<Record<string, string>> {
  const db = await admin();
  const { data } = await db.from("site_settings").select("value").eq("key", "shared_shifts").maybeSingle();
  return ((data as any)?.value ?? {}) as Record<string, string>;
}
export async function getSharedShiftFor(userId: string): Promise<string | null> {
  return (await readSharedShifts())[userId] ?? null;
}
export async function setSharedShiftFor(userId: string, shiftId: string | null) {
  const db = await admin();
  const map = await readSharedShifts();
  if (shiftId) map[userId] = shiftId;
  else delete map[userId];
  const { error } = await db
    .from("site_settings")
    .upsert({ key: "shared_shifts", value: map as any, updated_at: new Date().toISOString() } as any);
  if (error) throw new Error(error.message);
}
