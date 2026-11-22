

import { CARD_READ_FILTER } from "./bybit-confirmation";




import { admin } from "./work-db.server";
import { SUCCESS_STATUSES, EDIT_WINDOW_MS } from "./work-shared.server";
import { workTable } from "./work-analytics.server";

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
   */  const { data: assigns } = await db
    .from("work_txn_assignments")
    .select("shift_id, bybit_ledger!inner(status)")
    .not("bybit_ledger.detail", "cs", '{"side":"2"}')
    .not("bybit_ledger.detail", "cs", '{"side":2}')
    .or(`kind.not.in.(card,refund),${CARD_READ_FILTER}`, { referencedTable: "bybit_ledger" })
    .in(
      "shift_id",
      list.map((s) => s.id),    )
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
