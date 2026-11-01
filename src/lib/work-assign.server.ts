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
import { cardProjectionVisible } from "./bybit-confirmation";

/** Settlement of an earlier card authorisation (Bybit side 3). */
export function isCardSettlement(r: { kind?: string; detail?: any }): boolean {
  return r.kind === "card" && String(r.detail?.side ?? "") === "3";
}

export async function autoAssignLedger(db: any): Promise<number> {
  // More than one open shift used to make this query error out (maybeSingle),
  // which silently stopped every transaction from reaching the shift sheet.
  const { data: shifts } = await db
    .from("work_shifts")
    .select("id,user_id,started_at")
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1);
  const shift = shifts?.[0];
  if (!shift) return 0;


  const { data: fetched } = await db
    .from("bybit_ledger")
    .select("id,kind,occurred_at,detail")
    .not("kind", "in", `(${P2P_KINDS.join(",")})`)
    .gte("occurred_at", shift.started_at)
    .order("occurred_at", { ascending: false })
    .limit(5000);
  // Bybit's daily clearing posts settlements (side 3) for purchases that were
  // authorised earlier, often in a previous shift. They are not new purchases,
  // so they must never land in the currently open shift.
  const rows = (fetched ?? []).filter((r: any) =>
    (r.kind !== "card" && r.kind !== "refund" || cardProjectionVisible(r.detail)) &&
    !isCardSettlement(r) &&
    // A side-2 row is the provider's reversal event, NOT another purchase.
    !(r.kind === "card" && String(r.detail?.side ?? "") === "2")
  );
  if (!rows.length) return 0;

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
  if (saved > 0) {
    const { enforceRetentionSafe } = await import("./retention.server");
    await enforceRetentionSafe("work_txn_assignments");
  }
  return saved;
}
