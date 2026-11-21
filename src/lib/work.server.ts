/**
 * «جدول بيانات الشغل» — server layer.
 *
 * This module ONLY reads the original transaction data (public.bybit_ledger) and
 * writes only staff shift/assignment/input tables. It never modifies a
 * transaction's original fields. Historical biometric records remain untouched.
 */
import { isPastLastPage, pageRange } from "./pagination";
import { enforceRetentionSafe } from "./retention.server";
import { CARD_READ_FILTER } from "./bybit-confirmation";
import { readP2PLinks, P2P_SCHEMA_MESSAGE } from "./p2p-links.server";
import { readPages } from "./read-pages.server";
import { addWorkSummary, emptyWorkSummary } from "./work-summary";
import { cairoCalendarRange } from "./cairo-calendar";
import { hashPin } from "./pin-attempt.server";

import { admin, type DB } from "./work-db.server";

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
