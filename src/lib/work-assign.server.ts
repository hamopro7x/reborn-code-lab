/**
 * Automatic transaction -> shift linking for «جدول بيانات الشغل».
 *
 * Runs right after the central ledger sync stores rows. It only INSERTS rows
 * into work_txn_assignments; the original transaction data is never touched.
 *
 * Rules (as specified):
 * - P2P orders are never auto-linked; the manager links them manually once.
 * - Everything else is linked to the shift that is open, and only for movements
 *   that happened at or after that shift started.
 * - A transaction can only ever have one assignment (unique ledger_id).
 */
const P2P_KINDS = ["p2p_buy", "p2p_sell"];

export async function autoAssignLedger(db: any): Promise<number> {
  const { data: shift } = await db
    .from("work_shifts")
    .select("id,user_id,started_at")
    .is("ended_at", null)
    .maybeSingle();
  if (!shift) return 0;

  const { data: rows } = await db
    .from("bybit_ledger")
    .select("id,kind,occurred_at")
    .not("kind", "in", `(${P2P_KINDS.join(",")})`)
    .gte("occurred_at", shift.started_at)
    .order("occurred_at", { ascending: false })
    .limit(5000);
  if (!rows?.length) return 0;

  const payload = rows.map((r: any) => ({
    ledger_id: r.id,
    shift_id: shift.id,
    user_id: shift.user_id,
    occurred_at: r.occurred_at,
    kind: r.kind,
    assign_mode: "auto",
  }));

  let saved = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await db
      .from("work_txn_assignments")
      .upsert(payload.slice(i, i + 500), { onConflict: "ledger_id", ignoreDuplicates: true });
    if (error) console.error("work auto-assign failed:", error.message);
    else saved += Math.min(500, payload.length - i);
  }
  return saved;
}
