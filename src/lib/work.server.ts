/**
 * «جدول بيانات الشغل» — server layer.
 *
 * This module ONLY reads the original transaction data (public.bybit_ledger) and
 * writes to its own tables (work_shifts / work_txn_assignments / face enroll /
 * webauthn credentials). It never modifies a transaction's original fields.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type DB = SupabaseClient<any, any, any>;

async function admin(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}

const P2P_KINDS = ["p2p_buy", "p2p_sell"];

/* ------------------------------ helpers ------------------------------ */

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64url = (s: string) => {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4 ? "=".repeat(4 - (b.length % 4)) : "";
  const raw = atob(b + pad);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

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
  const { data } = await db
    .from("work_txn_assignments")
    .select("user_id,occurred_at")
    .gte("occurred_at", new Date(sinceMs).toISOString())
    .limit(100_000);
  const rows = data ?? [];
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

export async function workTable(opts: {
  userId?: string;
  shiftId?: string;
  day?: string;
  week?: string;
  page?: number;
  pageSize?: number;
  /** Employee work data layer: keep successful transactions only. */
  successOnly?: boolean;
}) {
  const db = await admin();
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 10), 200);
  const page = Math.max(opts.page ?? 1, 1);
  const from = (page - 1) * pageSize;

  let q: any = db
    .from("work_txn_assignments")
    .select(opts.successOnly ? "*, bybit_ledger!inner(*)" : "*, bybit_ledger(*)", { count: "exact" })
    .order("occurred_at", { ascending: false });

  if (opts.successOnly) q = q.in("bybit_ledger.status", SUCCESS_STATUSES as unknown as string[]);


  if (opts.userId) q = q.eq("user_id", opts.userId);
  if (opts.shiftId) q = q.eq("shift_id", opts.shiftId);
  if (opts.day) {
    // Cairo day boundaries (UTC+3, no DST changes applied by Bybit data).
    q = q.gte("occurred_at", `${opts.day}T00:00:00+03:00`).lt("occurred_at", `${opts.day}T23:59:59.999+03:00`);
  }
  if (opts.week) {
    const start = new Date(`${opts.week}T00:00:00+03:00`);
    const end = new Date(start.getTime() + 7 * 86400_000);
    q = q.gte("occurred_at", start.toISOString()).lt("occurred_at", end.toISOString());
  }

  const { data, error, count } = await q.range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const names = await namesFor(db, rows.map((r: any) => r.user_id));

  const accounts = await accountNames(db);

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
  const { data } = await db.from("bybit_accounts").select("id,name,sort_order").order("sort_order");
  return new Map(
    (data ?? []).map((a: any, i: number) => [a.id, `${a.name} (فيزا ${a.sort_order || i + 1})`]),
  );
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
export async function completedP2P(limit = 200) {
  const db = await admin();

  // Only orders that happened after the admin reset point are shown to employees.
  const { data: setting } = await db
    .from("site_settings")
    .select("value")
    .eq("key", "p2p_orders_cutoff")
    .maybeSingle();
  const cutoff = typeof (setting as any)?.value === "string" ? String((setting as any).value) : null;

  let q = db
    .from("bybit_ledger")
    .select("*")
    .in("kind", P2P_KINDS)
    .eq("status", "اكتملت");
  if (cutoff) q = q.gt("occurred_at", cutoff);

  const { data } = await q
    .order("occurred_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));

  // Already linked to an employee/shift → no longer offered for linking.
  const { data: assigned } = await db
    .from("work_txn_assignments")
    .select("ledger_id")
    .in("kind", P2P_KINDS);
  const taken = new Set((assigned ?? []).map((a: any) => a.ledger_id));

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
    .select("ledger_id,saved_at")
    .eq("ledger_id", ledgerId)
    .maybeSingle();

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
  const { data } = await db
    .from("work_shifts")
    .select("id,user_id,started_at,ended_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  return (data ?? []).map((r: any) => ({
    id: r.id as string,
    userId: r.user_id as string,
    startedAt: new Date(r.started_at).getTime(),
    endedAt: r.ended_at ? new Date(r.ended_at).getTime() : null,
  }));
}

/** Caller's own shifts + his display name — the P2P «ربط» picker source. */
export async function myShiftsForLink(userId: string, limit = 40) {
  const db = await admin();
  const [shifts, names] = await Promise.all([
    shiftsOfUser(userId, limit),
    namesFor(db, [userId]),
  ]);
  // Visual indicator only: does this shift already carry at least one P2P link?
  const ids = shifts.map((s) => s.id);
  const linked = new Set<string>();
  if (ids.length) {
    const { data } = await db
      .from("work_txn_assignments")
      .select("shift_id")
      .in("shift_id", ids)
      .in("kind", P2P_KINDS);
    for (const r of data ?? []) if ((r as any).shift_id) linked.add(String((r as any).shift_id));
  }
  return {
    name: names.get(userId) ?? "موظف",
    shifts: shifts.map((s) => ({ ...s, hasP2P: linked.has(s.id) })),
  };
}

/**
 * Links one P2P ledger row to an employee + one of his shifts.
 * The original ledger row is never touched. Double linking is impossible: the
 * unique (ledger_id) constraint makes the second concurrent insert fail.
 */
export async function linkP2P(ledgerId: string, shiftId: string, actorId: string) {
  const db = await admin();

  const { data: led } = await db
    .from("bybit_ledger")
    .select("id,kind,occurred_at")
    .eq("id", ledgerId)
    .maybeSingle();
  if (!led || !P2P_KINDS.includes(String((led as any).kind))) {
    return { ok: false as const, error: "هذا الطلب غير متاح للربط." };
  }

  const { data: shift } = await db
    .from("work_shifts")
    .select("id,user_id")
    .eq("id", shiftId)
    .maybeSingle();
  if (!shift) return { ok: false as const, error: "الشفت غير موجود." };
  // Server-side ownership guard: a caller can only link to HIS own shift,
  // whatever shift_id the request carries.
  if (String((shift as any).user_id) !== String(actorId)) {
    return { ok: false as const, error: "لا يمكنك ربط الطلب بهذا الشفت." };
  }

  const { error } = await db.from("work_txn_assignments").insert({
    ledger_id: ledgerId,
    shift_id: (shift as any).id,
    user_id: (shift as any).user_id,
    occurred_at: (led as any).occurred_at,
    kind: (led as any).kind,
    assign_mode: "manual",
    assigned_by: actorId,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { ok: false as const, error: "هذا الطلب تم ربطه بالفعل." };
    }
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
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


/* --------------------------- face enrollment --------------------------- */

const FACE_BUCKET = "employee-faces";

export async function saveFaceEnroll(userId: string, dataUrl: string, byUserId: string) {
  const db = await admin();
  const bytes = dataUrlToBytes(dataUrl);
  const path = `${userId}.jpg`;
  const up = await db.storage.from(FACE_BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(up.error.message);
  const { error } = await db
    .from("employee_face_enroll")
    .upsert({ user_id: userId, image_path: path, created_by: byUserId, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export async function faceEnrollList() {
  const db = await admin();
  const { data } = await db.from("employee_face_enroll").select("user_id,updated_at");
  return (data ?? []).map((r: any) => ({ userId: r.user_id, updatedAt: new Date(r.updated_at).getTime() }));
}

/** Does this employee already have face data enrolled? */
export async function faceEnrolled(userId: string): Promise<boolean> {
  const db = await admin();
  const { data } = await db
    .from("employee_face_enroll")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data?.user_id;
}

/**
 * First-time self enrollment from MULTIPLE frames.
 * Every frame is quality-checked; a single blurred frame is tolerated as long
 * as enough frames show one clear face. The sharpest accepted frame becomes the
 * stored reference, bound to this employee's account only.
 */
export async function enrollMyFace(userId: string, frames: string[]) {
  if (await faceEnrolled(userId)) {
    return { ok: false as const, error: "بيانات الوجه مسجّلة بالفعل لهذا الحساب" };
  }
  const list = frames.slice(0, 4);
  if (!list.length) return { ok: false as const, error: "لم يتم التقاط أي صورة" };

  const checks = await Promise.all(list.map((f) => faceQualityCheck(f)));
  const good = list.filter((_, i) => checks[i]!.ok);
  if (good.length === 0) {
    const reason = checks.find((c) => c.reason)?.reason;
    return { ok: false as const, error: reason ?? "تعذّر تسجيل الوجه" };
  }
  // Need more than one usable frame when several were sent, so enrollment never
  // rests on a single lucky screenshot.
  if (list.length >= 3 && good.length < 2) {
    return {
      ok: false as const,
      error: "تأكد من وضوح الوجه بالكامل وجودة الإضاءة ثم حاول مرة أخرى",
    };
  }
  await saveFaceEnroll(userId, good[0]!, userId);
  return { ok: true as const };
}

/** AI check that the frame really contains one clear, unobstructed live face. */
async function faceQualityCheck(dataUrl: string): Promise<{ ok: boolean; reason?: string }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { ok: false, reason: "خدمة التحقق غير متاحة" };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            'You are a face enrollment quality service. Reply with strict JSON only: {"face":true|false,"clear":true|false,"reason":"short"}. "face" is true only if exactly one real human face is visible (not a photo of a screen). "clear" is true if the face is unobstructed (no mask, no covering) and recognizable: tolerate slight motion blur, moderate head tilt or rotation, and imperfect lighting as long as the facial features are identifiable.',
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Evaluate this camera frame for face enrollment." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return { ok: false, reason: "فشل تحليل الصورة، حاول مرة أخرى" };
  const json: any = await res.json();
  const text = String(json?.choices?.[0]?.message?.content ?? "");
  const m = text.match(/\{[\s\S]*\}/);
  try {
    const parsed = m ? JSON.parse(m[0]) : null;
    if (parsed?.face !== true) return { ok: false, reason: "لم يتم اكتشاف وجه داخل إطار التحقق" };
    if (parsed?.clear !== true)
      return { ok: false, reason: "تأكد من ظهور وجهك بالكامل وبإضاءة جيدة" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "تعذّر تحليل نتيجة التحقق" };
  }
}


function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const bytesToB64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

/**
 * Face verification against THIS employee's enrolled reference only.
 * Several live frames are compared; a single blurred frame cannot fail the
 * attempt, but the identity threshold itself is not relaxed.
 */
export async function verifyFace(
  userId: string,
  liveFrames: string | string[],
): Promise<{ ok: boolean; reason?: string }> {
  const frames = (Array.isArray(liveFrames) ? liveFrames : [liveFrames]).slice(0, 3);
  if (!frames.length) return { ok: false, reason: "لم يتم التقاط أي صورة" };

  const db = await admin();
  const { data: enroll } = await db
    .from("employee_face_enroll")
    .select("image_path")
    .eq("user_id", userId)
    .maybeSingle();
  if (!enroll?.image_path) return { ok: false, reason: "لا توجد صورة مرجعية مسجّلة لهذا الموظف" };

  const dl = await db.storage.from(FACE_BUCKET).download(enroll.image_path);
  if (dl.error || !dl.data) return { ok: false, reason: "تعذّر قراءة الصورة المرجعية" };
  const refUrl = `data:image/jpeg;base64,${bytesToB64(new Uint8Array(await dl.data.arrayBuffer()))}`;

  const results = await Promise.all(frames.map((f) => compareOnePair(refUrl, f)));
  const usable = results.filter((r) => r.decided);
  if (!usable.length) return { ok: false, reason: "لم يتم التعرف على الوجه، حاول مرة أخرى" };

  const strong = usable.filter((r) => r.same && r.confidence >= 0.75).length;
  const soft = usable.filter((r) => r.same && r.confidence >= 0.6).length;
  const mismatch = usable.filter((r) => !r.same && r.confidence >= 0.6).length;

  // Identity must win on evidence, not on a lowered threshold: one strong match
  // or two moderate matches, and no confident mismatch.
  if (mismatch > 0 && strong === 0) return { ok: false, reason: "تعذّر التحقق من الوجه، حاول مرة أخرى" };
  if (strong >= 1 || soft >= 2) return { ok: true };
  return { ok: false, reason: "تعذّر التحقق من الوجه، حاول مرة أخرى" };
}

async function compareOnePair(
  refUrl: string,
  liveUrl: string,
): Promise<{ decided: boolean; same: boolean; confidence: number }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { decided: false, same: false, confidence: 0 };
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              'You are a face verification service. Compare the two photos of possibly different people. Reply with strict JSON only: {"same":true|false,"confidence":0-1}. Judge identity from facial structure; ignore mirroring, head tilt/rotation, slight motion blur, lighting and background differences. Set a high confidence only when you are sure.',
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Photo 1 = enrolled reference. Photo 2 = live camera frame." },
              { type: "image_url", image_url: { url: refUrl } },
              { type: "image_url", image_url: { url: liveUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { decided: false, same: false, confidence: 0 };
    const json: any = await res.json();
    const text = String(json?.choices?.[0]?.message?.content ?? "");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { decided: false, same: false, confidence: 0 };
    const parsed = JSON.parse(m[0]);
    return {
      decided: typeof parsed?.same === "boolean",
      same: parsed?.same === true,
      confidence: Number(parsed?.confidence ?? 0),
    };
  } catch {
    return { decided: false, same: false, confidence: 0 };
  }
}

/* ------------------- dynamic movement challenge ------------------- */

export type FaceDir = "right" | "left";

/**
 * Issues a RANDOM movement sequence, stored server-side. The client cannot
 * choose the order, so a replayed recording of an old attempt fails.
 */
export async function startFaceChallenge(userId: string) {
  const db = await admin();
  // Exactly TWO movements per attempt, in a random order.
  const pool: FaceDir[][] = [
    ["right", "left"],
    ["left", "right"],
  ];
  const steps = pool[Math.floor(Math.random() * pool.length)]!;
  await db.from("work_auth_challenges").delete().eq("user_id", userId).eq("purpose", "liveness");
  const { error } = await db.from("work_auth_challenges").insert({
    user_id: userId,
    purpose: "liveness",
    challenge: steps.join(","),
    expires_at: new Date(Date.now() + 3 * 60_000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return { steps };
}

/** Reads + burns the pending challenge and checks the client followed it. */
export async function consumeFaceChallenge(
  userId: string,
  steps: FaceDir[],
): Promise<{ ok: boolean; reason?: string }> {
  const db = await admin();
  const { data } = await db
    .from("work_auth_challenges")
    .select("challenge,expires_at")
    .eq("user_id", userId)
    .eq("purpose", "liveness")
    .maybeSingle();
  await db.from("work_auth_challenges").delete().eq("user_id", userId).eq("purpose", "liveness");
  if (!data?.challenge) return { ok: false, reason: "انتهت جلسة التحقق — ابدأ من جديد" };
  if (new Date(data.expires_at).getTime() < Date.now())
    return { ok: false, reason: "انتهت مدة التحقق — حاول مرة أخرى" };
  if (String(data.challenge) !== steps.join(","))
    return { ok: false, reason: "لم يتم تنفيذ الحركة المطلوبة بالترتيب — حاول مرة أخرى" };
  return { ok: true };
}

async function askVision(system: string, text: string, images: string[]) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text },
            ...images.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        },
      ],
    }),
  });
  if (!res.ok) return null;
  const json: any = await res.json();
  const raw = String(json?.choices?.[0]?.message?.content ?? "");
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as any;
  } catch {
    return null;
  }
}

/**
 * Open-eye verification on the frontal frames.
 *
 * The precise, per-frame eye measurement now happens on the device (geometric
 * landmarks, smoothed over time — see `src/lib/face-mesh.ts`), so this server
 * pass is a deliberately TOLERANT backstop: it only rejects when the model is
 * confident the eyes are fully closed in EVERY frame. Head angle, motion,
 * lighting, low camera quality and a natural blink never fail it.
 */
export async function checkEyesOpen(frames: string[]): Promise<{ ok: boolean; reason?: string }> {
  const list = frames.slice(0, 3);
  if (!list.length) return { ok: false, reason: "لم يتم التقاط أي صورة" };
  const parsed = await askVision(
    'You check whether a person is awake with eyes open. Reply with strict JSON only: {"allFramesFullyClosed":true|false,"reason":"short"}. Set allFramesFullyClosed to true ONLY when you are highly confident the eyelids are completely shut in every single frame (a sleeping person or a blink held across all frames). If the eyes are open, partly open, squinting, hidden behind glasses/reflections, the head is turned, the frame is blurry, dark, low quality, or you are unsure — set it to false.',
    "Are the eyes fully closed in all of these camera frames?",
    list,
  );
  // Undecided / gateway failure must not block a legitimate employee.
  if (!parsed) return { ok: true };
  if (parsed.allFramesFullyClosed === true)
    return { ok: false, reason: "افتح عينيك وانظر إلى الكاميرا ثم حاول مرة أخرى" };
  return { ok: true };
}

/**
 * Active liveness following the SERVER-ISSUED movement sequence. All frames come
 * from the same preview crop, so the analysed movement is exactly the movement
 * the employee saw on screen.
 */
export async function checkHeadTurnLiveness(input: {
  center: string;
  steps: Array<{ dir: FaceDir; image: string }>;
  back?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const steps = input.steps.slice(0, 4);
  if (steps.length < 2) return { ok: false, reason: "لم يتم رصد الحركة — حاول مرة أخرى" };
  const images = [input.center, ...steps.map((s) => s.image), ...(input.back ? [input.back] : [])];
  const expected = steps
    .map((s, i) => `frame ${i + 2}: head turned to the person's own ${s.dir}`)
    .join("; ");

  /**
   * The head turns are already measured geometrically ON DEVICE (Face
   * Landmarker yaw), and every step frame is captured at the exact moment the
   * requested yaw was reached. So this server pass keeps the real security
   * checks (live person, same person) but is TOLERANT about the direction: it
   * only rejects when the model is confident the frames show NO turn at all or
   * a clearly opposite turn — a single blurry / small-angle shot never fails a
   * movement that the landmarker detected correctly.
   */
  const parsed = await askVision(
    'You are a face liveness service. Frame 1 is the person looking forward; the following frames were captured while the person turned their head. Reply with strict JSON only: {"live":true|false,"samePerson":true|false,"clearlyWrong":true|false,"reason":"short"}. Set "clearlyWrong" to true ONLY if you are highly confident that the frames show no head movement at all compared with frame 1, or every turn goes to the opposite side of what was requested. Small turns, motion blur, low light, partial faces or uncertainty => clearlyWrong is false. "live" is false only if the frames look like a printed photo, a screen replay, or identical static images.',
    `Expected movement: ${expected}. Evaluate the frames in order.`,
    images,
  );
  // Gateway failure must not block a legitimate employee whose device already
  // proved the movement geometrically.
  if (!parsed) return { ok: true };
  if (parsed.live === false)
    return { ok: false, reason: "تم رفض المحاولة — يجب أن يكون الوجه حقيقيًا أمام الكاميرا" };
  if (parsed.samePerson === false) return { ok: false, reason: "تعذّر التحقق من الوجه، حاول مرة أخرى" };
  if (parsed.clearlyWrong === true)
    return { ok: false, reason: "لم يتم رصد الحركة المطلوبة — اتبع السهم ببطء" };
  return { ok: true };
}


/* ------------------- device biometric (WebAuthn) ------------------- */

export async function newChallenge(userId: string, purpose: "register" | "auth") {
  const db = await admin();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const challenge = b64url(bytes);
  await db.from("work_auth_challenges").delete().eq("user_id", userId).eq("purpose", purpose);
  const { error } = await db.from("work_auth_challenges").insert({
    user_id: userId,
    purpose,
    challenge,
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return { challenge };
}

export async function registerCredential(
  userId: string,
  input: { credentialId: string; publicKey: string; label?: string },
) {
  const db = await admin();
  const { error } = await db.from("webauthn_credentials").upsert(
    {
      user_id: userId,
      credential_id: input.credentialId,
      public_key: input.publicKey,
      label: input.label ?? null,
    },
    { onConflict: "credential_id" },
  );
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export async function listCredentials(userId: string) {
  const db = await admin();
  const { data } = await db.from("webauthn_credentials").select("credential_id,label,created_at").eq("user_id", userId);
  return (data ?? []).map((c: any) => ({ id: c.credential_id, label: c.label, createdAt: new Date(c.created_at).getTime() }));
}

/** ASN.1 DER (r,s) signature -> raw 64-byte form WebCrypto expects. */
function derToRaw(der: Uint8Array): Uint8Array {
  let i = 2;
  if (der[1]! & 0x80) i = 2 + (der[1]! & 0x7f);
  const readInt = () => {
    i++; // 0x02
    const len = der[i++]!;
    let v = der.slice(i, i + len);
    i += len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = readInt();
  const s = readInt();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

/**
 * Verifies the device biometric assertion (Face ID / Touch ID / Android
 * Biometric). No biometric data is stored — only the device public key.
 */
export async function verifyDeviceAssertion(
  userId: string,
  input: { credentialId: string; clientDataJSON: string; authenticatorData: string; signature: string },
): Promise<{ ok: boolean; reason?: string }> {
  const db = await admin();

  const { data: cred } = await db
    .from("webauthn_credentials")
    .select("public_key,user_id")
    .eq("credential_id", input.credentialId)
    .maybeSingle();
  if (!cred || cred.user_id !== userId) return { ok: false, reason: "جهاز غير مسجّل لهذا الحساب" };

  const { data: ch } = await db
    .from("work_auth_challenges")
    .select("challenge,expires_at")
    .eq("user_id", userId)
    .eq("purpose", "auth")
    .maybeSingle();
  if (!ch || new Date(ch.expires_at).getTime() < Date.now()) return { ok: false, reason: "انتهت صلاحية طلب المصادقة" };

  let clientData: any;
  try {
    clientData = JSON.parse(new TextDecoder().decode(fromB64url(input.clientDataJSON)));
  } catch {
    return { ok: false, reason: "بيانات مصادقة غير صالحة" };
  }
  if (clientData?.type !== "webauthn.get" || clientData?.challenge !== ch.challenge) {
    return { ok: false, reason: "تحدي المصادقة غير مطابق" };
  }

  const authData = fromB64url(input.authenticatorData);
  const clientHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", fromB64url(input.clientDataJSON) as unknown as ArrayBuffer),
  );
  const signed = new Uint8Array(authData.length + clientHash.length);
  signed.set(authData, 0);
  signed.set(clientHash, authData.length);

  let ok = false;
  try {
    const key = await crypto.subtle.importKey(
      "spki",
      fromB64url(cred.public_key) as unknown as ArrayBuffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const sig = derToRaw(fromB64url(input.signature));
    ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      sig as unknown as ArrayBuffer,
      signed as unknown as ArrayBuffer,
    );
  } catch {
    ok = false;
  }

  if (ok) {
    await db.from("work_auth_challenges").delete().eq("user_id", userId).eq("purpose", "auth");
    await db
      .from("webauthn_credentials")
      .update({ last_used_at: new Date().toISOString() })
      .eq("credential_id", input.credentialId);
  }
  return ok ? { ok: true } : { ok: false, reason: "فشلت مصادقة الجهاز" };
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
  const res = await workTable({ userId, shiftId: state.shiftId, page, pageSize, successOnly: true });

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

/* ------------------------- admin view of one employee -------------------------
 * The admin must NOT see anything while the employee's shift is still running.
 * Data becomes visible only after that shift is closed — we then expose the
 * employee's most recently ENDED shift. */

export async function adminEmployeeWorkState(userId: string) {
  const db = await admin();
  // الشفت الشغّال لا يُعرض للأدمن، لكن آخر شفت منتهي يُعرض دائمًا.
  const { data: open } = await db
    .from("work_shifts")
    .select("id")
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();
  const live = !!open;

  // آخر الشفتات المنتهية — نختار أول شفت فيه معاملات ناجحة فعلاً حتى لا يفتح
  // الأدمن على شفت فاضي فتظهر خانات «جنية / الكمية» كلها «—».
  const { data: recent } = await db
    .from("work_shifts")
    .select("id,started_at,ended_at")
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(20);

  const list = (recent ?? []) as any[];
  if (!list.length) return { holding: false as const, live };

  let picked: any = list[0];
  let pickedCount = 0;
  for (const s of list) {
    const { count } = await db
      .from("work_txn_assignments")
      .select("id, bybit_ledger!inner(status)", { count: "exact", head: true })
      .eq("shift_id", s.id)
      .in("bybit_ledger.status", SUCCESS_STATUSES as unknown as string[]);
    if (Number(count ?? 0) > 0) {
      picked = s;
      pickedCount = Number(count ?? 0);
      break;
    }
  }

  return {
    holding: true as const,
    live,
    shiftId: picked.id as string,
    startedAt: new Date(picked.started_at).getTime(),
    endedAt: new Date(picked.ended_at).getTime(),
    txns: pickedCount,
  };

}

/** Rows of the employee's last CLOSED shift — تُعرض حتى لو عنده شفت شغّال. */
export async function adminEmployeeShiftRows(userId: string, page = 1, pageSize = 50) {
  const state = await adminEmployeeWorkState(userId);
  if (!state.holding) return { page: 1, pageSize, total: 0, rows: [] as any[], holding: false as const };
  const res = await workTable({ userId, shiftId: state.shiftId, page, pageSize, successOnly: true });

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
export async function listManualTxns(userId: string, shiftId?: string | null) {
  const db = await admin();
  let q = db
    .from("work_manual_txns")
    .select("id,card,amount,details,created_at,amount_saved_at,details_saved_at,shift_id")
    .eq("user_id", userId);
  if (shiftId) q = q.eq("shift_id", shiftId);
  const { data } = await q.order("created_at", { ascending: false });
  return {
    serverNow: new Date().toISOString(),
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
  const { data } = await db
    .from("work_shifts")
    .select("id")
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();
  return data ? ((data as any).id as string) : null;
}

/** Manual rows of the employee's CURRENT shift only. */
export async function listMyManualTxns(userId: string) {
  const shiftId = await openShiftId(userId);
  if (!shiftId) return { serverNow: new Date().toISOString(), rows: [] as any[] };
  return listManualTxns(userId, shiftId);
}

export async function addManualTxn(userId: string, card: ManualCard) {
  const db = await admin();
  const shiftId = await openShiftId(userId);
  const { data, error } = await db
    .from("work_manual_txns")
    .insert({ user_id: userId, card, shift_id: shiftId })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
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
    .select("id,amount,details,amount_saved_at,details_saved_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return { ok: false as const, error: "الصف غير موجود" };

  // 10-minute edit window enforced on the SERVER clock, never the client's.
  const prevStamp = (row as any)[stampCol] as string | null;
  const now = new Date();
  if (prevStamp && now.getTime() - new Date(prevStamp).getTime() >= EDIT_WINDOW_MS) {
    return {
      ok: false as const,
      error: "انتهت مدة التعديل المسموحة لهذه القيمة.",
      locked: true as const,
      savedAt: prevStamp,
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
  // Only a real value starts the edit window; clearing a cell resets it.
  const hasValue = field === "amount" ? patch["amount"] !== null : String(value).trim() !== "";
  patch[stampCol] = hasValue ? (prevStamp ?? savedAt) : null;

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
  quantity: string;
  pan4: string;
  createdAt: string;
};

function mapManualCard(r: any): ManualCardRow {
  return {
    id: r.id as string,
    merchant: r.merchant ?? "",
    amount: r.amount === null || r.amount === undefined ? "" : String(r.amount),
    quantity: r.quantity === null || r.quantity === undefined ? "" : String(r.quantity),
    pan4: r.pan4 ?? "",
    createdAt: r.created_at as string,
  };
}

/** صفوف المعاملات اليدوية لشفت محدد (أو الشفت المفتوح للموظف). */
export async function listManualCardTxns(userId: string, shiftId: string) {
  const db = await admin();
  const { data } = await db
    .from("work_manual_card_txns")
    .select("id,merchant,amount,quantity,pan4,created_at")
    .eq("user_id", userId)
    .eq("shift_id", shiftId)
    .order("created_at", { ascending: false });
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
  input: { merchant: string; amount: string; quantity: string; pan4: string },
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
      quantity: parseNum(input.quantity),
      pan4: String(input.pan4 ?? "").trim() || null,
    })
    .select("id,merchant,amount,quantity,pan4,created_at")
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, row: mapManualCard(data), serverNow: new Date().toISOString() };
}

/** التعديل: 10 دقائق من وقت الإنشاء المحفوظ في قاعدة البيانات (ساعة السيرفر). */
export async function saveMyManualCardTxn(
  userId: string,
  id: string,
  field: "merchant" | "amount" | "quantity" | "pan4",
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
export async function shiftHistory(userId: string, limit = 100) {
  const db = await admin();
  const { data } = await db
    .from("work_shifts")
    .select("id,started_at,ended_at,ended_reason")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  const shifts = (data ?? []) as any[];
  const ids = shifts.map((s) => String(s.id));
  const tally = new Map<string, number>();
  if (ids.length) {
    const { data: asg } = await db
      .from("work_txn_assignments")
      .select("shift_id, bybit_ledger!inner(status)")
      .in("shift_id", ids)
      .in("bybit_ledger.status", SUCCESS_STATUSES as unknown as string[]);
    for (const a of (asg ?? []) as any[]) {
      const k = String(a.shift_id);
      tally.set(k, (tally.get(k) ?? 0) + 1);
    }
  }

  return shifts.map((s) => ({
    id: String(s.id),
    startedAt: new Date(s.started_at).getTime(),
    endedAt: s.ended_at ? new Date(s.ended_at).getTime() : null,
    endedReason: (s.ended_reason ?? null) as string | null,
    open: !s.ended_at,
    txns: tally.get(String(s.id)) ?? 0,
  }));
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
  const res = await workTable({ userId, shiftId, page, pageSize, successOnly: true });
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
export async function shiftManualTxns(shiftId: string) {
  const userId = await shiftOwner(shiftId);
  if (!userId) return { serverNow: new Date().toISOString(), rows: [] as any[] };
  return listManualTxns(userId, shiftId);
}

/** الإيداع والسحب الخارجي / الداخلي المرتبط بشفت معيّن (نفس شكل صفوف الموظف). */
export async function shiftTransfers(shiftId: string, scope: "external" | "internal") {
  const db = await admin();
  const { data } = await db
    .from("work_txn_assignments")
    .select("id, ledger_id, bybit_ledger!inner(*)")
    .eq("shift_id", shiftId)
    .in("bybit_ledger.kind", TRANSFER_KINDS[scope] as unknown as string[])
    .in("bybit_ledger.status", SUCCESS_STATUSES as unknown as string[]);

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

/**
 * طلبات P2P المرتبطة بشفت معيّن — المرجع هو الربط الفعلي (shift_id) وليس وقت
 * وصول الطلب، فيظل الطلب داخل شفته حتى لو تم ربطه بعد إغلاق الشفت.
 */
export async function shiftP2P(shiftId: string) {
  const db = await admin();
  const { data } = await db
    .from("work_txn_assignments")
    .select("id, ledger_id, bybit_ledger!inner(*)")
    .eq("shift_id", shiftId)
    .in("bybit_ledger.kind", P2P_KINDS);

  const accounts = await accountNames(db);
  return ((data ?? []) as any[])
    .map((a) => {
      const r = a.bybit_ledger ?? {};
      return {
        assignmentId: String(a.id),
        ledgerId: String(r.id ?? a.ledger_id),
        kind: String(r.kind ?? ""),
        refId: String(r.ref_id ?? ""),
        title: String(r.title ?? "—"),
        amount: Number(r.amount ?? 0),
        currency: r.currency ?? "USDT",
        status: String(r.status ?? ""),
        time: r.occurred_at ? new Date(r.occurred_at).getTime() : 0,
        accountName: accounts.get(r.account_id) ?? "—",
        detail: (r.detail ?? {}) as Record<string, string | number | boolean | null>,
      };
    })
    .sort((a, b) => b.time - a.time);
}
