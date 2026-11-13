import type { SupabaseClient } from "@supabase/supabase-js";

type DB = SupabaseClient<any, any, any>;
export const P2P_SCHEMA_MESSAGE = "تحديث ربط وإخفاء شفتات P2P لسه مش متطبق على قاعدة الموقع.";

export type P2PLink = {
  id: string;
  ledger_id: string;
  shift_id: string | null;
  user_id: string;
  started_at: string | null;
  ended_at: string | null;
  legacy_group: string | null;
  source: string;
};

const schemaMissing = (error: { code?: string } | null) =>
  !!error && ["42P01", "PGRST205"].includes(error.code ?? "");

/** Paginate explicitly: PostgREST caps a response at 1000 rows. */
export async function readP2PLinks(db: DB, where: { shiftId?: string; shiftIds?: string[]; userId?: string; ledgerIds?: string[] } = {}) {
  if (where.ledgerIds?.length === 0) return [];
  const rows: P2PLink[] = [];
  for (let from = 0; ; from += 500) {
    let q = db.from("work_p2p_effective_links").select("*").order("id");
    if (where.shiftId) q = q.eq("shift_id", where.shiftId);
    if (where.shiftIds) q = q.in("shift_id", where.shiftIds);
    if (where.userId) q = q.eq("user_id", where.userId);
    if (where.ledgerIds) q = q.in("ledger_id", where.ledgerIds);
    const { data, error } = await q.range(from, from + 499);
    if (schemaMissing(error)) return readLegacyLinks(db, where);
    if (error) throw new Error("تعذر تحميل روابط P2P. حاول مرة أخرى.");
    rows.push(...(data ?? []) as P2PLink[]);
    if ((data ?? []).length < 500) return rows;
  }
}

/** Read-only compatibility before rollout: direct assignments only, never infer colour-group links. */
async function readLegacyLinks(db: DB, where: { shiftId?: string; shiftIds?: string[]; userId?: string; ledgerIds?: string[] }) {
  const rows: P2PLink[] = [];
  for (let from = 0; ; from += 500) {
    let q = db.from("work_txn_assignments")
      .select("id,ledger_id,shift_id,user_id,work_shifts(started_at,ended_at,link_group)")
      .in("kind", ["p2p_buy", "p2p_sell"]).order("id");
    if (where.shiftId) q = q.eq("shift_id", where.shiftId);
    if (where.shiftIds) q = q.in("shift_id", where.shiftIds);
    if (where.userId) q = q.eq("user_id", where.userId);
    if (where.ledgerIds) q = q.in("ledger_id", where.ledgerIds);
    const { data, error } = await q.range(from, from + 499);
    if (error) throw new Error("تعذر تحميل روابط P2P القديمة.");
    rows.push(...(data ?? []).map((a: any): P2PLink => ({
      id: a.id, ledger_id: a.ledger_id, shift_id: a.shift_id, user_id: a.user_id,
      started_at: a.work_shifts?.started_at ?? null, ended_at: a.work_shifts?.ended_at ?? null,
      legacy_group: a.work_shifts?.link_group ?? null, source: "legacy-assignment",
    })));
    if ((data ?? []).length < 500) return rows;
  }
}