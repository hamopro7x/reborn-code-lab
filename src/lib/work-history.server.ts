import { isPastLastPage, pageRange } from "./pagination";
import { enforceRetentionSafe } from "./retention.server";
import { CARD_READ_FILTER } from "./bybit-confirmation";
import { readP2PLinks, P2P_SCHEMA_MESSAGE } from "./p2p-links.server";
import { readPages } from "./read-pages.server";
import { addWorkSummary, emptyWorkSummary } from "./work-summary";
import { cairoCalendarRange } from "./cairo-calendar";
import { admin, type DB } from "./work-db.server";
import { SUCCESS_STATUSES, MANUAL_CARD_EDIT_MS, type ManualCard } from "./work-shared.server";
import { workTable } from "./work-analytics.server";
import { myEntries } from "./work-employee.server";
import { listManualTxns, listManualCardTxns, mapManualCard, type ManualCardRow } from "./work-manual.server";
import { p2pByAssignment } from "./work-p2p.server";
import { transfersByAssignment } from "./work-transfers.server";

const P2P_KINDS = ["p2p_buy", "p2p_sell"];

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
