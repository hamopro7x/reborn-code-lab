import { isPastLastPage, pageRange } from "./pagination";
import { enforceRetentionSafe } from "./retention.server";
import { CARD_READ_FILTER } from "./bybit-confirmation";
import { readP2PLinks, P2P_SCHEMA_MESSAGE } from "./p2p-links.server";
import { readPages } from "./read-pages.server";
import { addWorkSummary, emptyWorkSummary } from "./work-summary";
import { cairoCalendarRange } from "./cairo-calendar";
import { admin, type DB } from "./work-db.server";
import { accountNames, namesFor, SUCCESS_STATUSES, TRANSFER_KINDS, NOTE_EDIT_WINDOW_MS } from "./work-shared.server";
import { listShifts, productivity, workTable } from "./work-analytics.server";
import { adminEmployeeWorkState } from "./work-employee.server";
import { openShiftId } from "./work-manual.server";

const P2P_KINDS = ["p2p_buy", "p2p_sell"];

/* ------------------------------ helpers ------------------------------ */

/** Day key in Cairo time, so the daily/weekly report matches the working day. */

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

export async function p2pByAssignment(where: { shiftId?: string; userId?: string }, viewerId?: string) {
  const db = await admin();
  const links = await readP2PLinks(db, { ...where, ...(viewerId ? { userId: viewerId } : {}) });
  const ledgerIds = [...new Set(links.map((l) => l.ledger_id))];
  if (!ledgerIds.length) return [];  const allLinks = await readP2PLinks(db, { ledgerIds, ...(viewerId ? { userId: viewerId } : {}) });
  const names = await namesFor(db, allLinks.map((l) => l.user_id));
  const data: any[] = [];
  for (let from = 0; from < ledgerIds.length; from += 100) {
    const result = await db.from("bybit_ledger").select("*").in("kind", P2P_KINDS)
      .in("id", ledgerIds.slice(from, from + 100));
    if (result.error) throw new Error("تعذر تحميل طلبات P2P المرتبطة.");
    data.push(...(result.data ?? []));
  }

  const accounts = await accountNames(db);
  const seen = new Set<string>();  const out: any[] = [];
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
