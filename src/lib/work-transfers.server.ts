import { readPages } from "./read-pages.server";
import { admin } from "./work-db.server";
import { accountNames, SUCCESS_STATUSES, TRANSFER_KINDS, NOTE_EDIT_WINDOW_MS } from "./work-shared.server";
import { workTable } from "./work-analytics.server";
import { openShiftId } from "./work-manual.server";

/** Read-only external/internal movements from the central Bybit ledger. */
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

export async function myShiftTransfers(userId: string, scope: "external" | "internal") {
  const db = await admin();
  const { data } = await db
    .from("work_shifts")
    .select("id,user_id,started_at")
    .is("ended_at", null)
    .maybeSingle();  if (!data || (data as any).user_id !== userId) return [];
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

  // Employees may annotate only withdrawals visible in their own current shift.
  // The UI filter is not an authorization boundary: validate the same scope here.
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
  if (!isAdmin) {
    const { data: shift } = await db
      .from("work_shifts")
      .select("id")
      .eq("user_id", userId)
      .is("ended_at", null)
      .maybeSingle();
    if (!shift) {
      return { ok: false as const, error: "ليس لديك شفت مفتوح حاليًا." };
    }
    const { data: assignment } = await db
      .from("work_txn_assignments")
      .select("id")
      .eq("shift_id", (shift as any).id)
      .eq("user_id", userId)
      .eq("ledger_id", ledgerId)
      .maybeSingle();
    if (!assignment) {
      return { ok: false as const, error: "هذه المعاملة ليست ضمن شفتك الحالي." };
    }
  }

  const { data: existing } = await db
    .from("work_transfer_notes")
    .select("ledger_id,saved_at,user_id")
    .eq("ledger_id", ledgerId)
    .maybeSingle();

  if (existing && (existing as any).user_id && (existing as any).user_id !== userId && !isAdmin) {
    return { ok: false as const, error: "هذه الملاحظة خاصة بموظف آخر." };
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


export async function transfersByAssignment(
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

