import { isPastLastPage, pageRange } from "./pagination";
import { enforceRetentionSafe } from "./retention.server";
import { CARD_READ_FILTER } from "./bybit-confirmation";
import { readP2PLinks, P2P_SCHEMA_MESSAGE } from "./p2p-links.server";
import { readPages } from "./read-pages.server";
import { addWorkSummary, emptyWorkSummary } from "./work-summary";
import { cairoCalendarRange } from "./cairo-calendar";
import { admin, type DB } from "./work-db.server";
import { EDIT_WINDOW_MS, MANUAL_EMPTY_ROW_TTL_MS, MANUAL_NO_SHIFT_VISIBLE_MS, MANUAL_CARD_EDIT_MS, type ManualCard } from "./work-shared.server";

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

export async function openShiftId(userId: string): Promise<string | null> {  const db = await admin();
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
      .replace(/[^\d.-]/g, "")
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

export type ManualCardRow = {
  id: string;
  merchant: string;
  amount: string;
  egp: string;
  quantity: string;
  pan4: string;
  createdAt: string;
};

export function mapManualCard(r: any): ManualCardRow {
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
    .replace(/[^\d.-]/g, "")
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

  const now = new Date();  // كل الخانات (بما فيها «جنية») متاحة للتعديل 10 دقائق فقط.
  if (now.getTime() - new Date((row as any).created_at).getTime() >= MANUAL_CARD_EDIT_MS) {
    return {
      ok: false as const,
      locked: true as const,
      error: "انتهت مدة التعديل المسموحة (10 دقائق).",
      serverNow: now.toISOString(),
    };
  }

  const patch: Record<string, unknown> =    field === "merchant"
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
