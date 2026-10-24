import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const actor = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const old = "00000000-0000-0000-0000-000000000011";
const open = "00000000-0000-0000-0000-000000000012";
const foreign = "00000000-0000-0000-0000-000000000013";
const orderA = "00000000-0000-0000-0000-000000000021";
const orderB = "00000000-0000-0000-0000-000000000022";
let db: PGlite;

async function link(order: string, target = open, selected = [old, open]) {
  const result = await db.query<{ result: { ok: boolean; error?: string } }>(
    "SELECT public.work_link_p2p_atomic($1,$2,$3,$4::uuid[]) AS result",
    [order, target, actor, selected],
  );
  return result.rows[0]?.result;
}

describe("P2P linking database transaction", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE work_shifts (id uuid PRIMARY KEY, user_id uuid, started_at timestamptz, ended_at timestamptz, ended_reason text);
      CREATE TABLE bybit_ledger (id uuid PRIMARY KEY, kind text, occurred_at timestamptz);
      CREATE TABLE work_txn_assignments (id uuid DEFAULT gen_random_uuid(), ledger_id uuid UNIQUE REFERENCES bybit_ledger(id),
        shift_id uuid REFERENCES work_shifts(id), user_id uuid, occurred_at timestamptz, kind text, assign_mode text, assigned_by uuid);
    `);
    await db.exec(readFileSync(new URL("../../supabase/manual/p2p_link_atomic.sql", import.meta.url), "utf8"));
  });
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.exec("TRUNCATE work_txn_assignments, bybit_ledger, work_shifts CASCADE;");
    await db.query(`INSERT INTO work_shifts(id,user_id,started_at,ended_at) VALUES
      ($1,$4,'2026-10-23 10:00Z','2026-10-23 11:00Z'),
      ($2,$4,'2026-10-24 10:00Z',NULL),($3,$5,'2026-10-22 10:00Z','2026-10-22 11:00Z')`,
      [old, open, foreign, actor, other]);
    await db.query("INSERT INTO bybit_ledger VALUES ($1,'p2p_buy',now()),($2,'p2p_sell',now())", [orderA, orderB]);
  });
  it("assigns the order only to the newest selected shift and consumes ended shifts", async () => {
    expect(await link(orderA)).toEqual({ ok: true });
    const assignment = await db.query<{ shift_id: string }>("SELECT shift_id FROM work_txn_assignments");
    expect(assignment.rows).toEqual([{ shift_id: open }]);
    const shifts = await db.query<{ id: string; ended_reason: string | null; link_group: string }>("SELECT id, ended_reason, link_group FROM work_shifts WHERE id IN ($1,$2) ORDER BY id", [old, open]);
    expect(shifts.rows[0]?.ended_reason).toBe("p2p_used");
    expect(shifts.rows[1]?.ended_reason).toBeNull();
    expect(shifts.rows[0]?.link_group).toBeTruthy();
    expect(shifts.rows[0]?.link_group).toBe(shifts.rows[1]?.link_group);
  });
  it("allows repeated orders on the open shift", async () => {
    expect((await link(orderA))?.ok).toBe(true);
    expect((await link(orderB, open, [open]))?.ok).toBe(true);
    expect((await db.query("SELECT * FROM work_txn_assignments")).rows).toHaveLength(2);
  });
  it("rejects reuse of an already consumed ended shift", async () => {
    await link(orderA);
    expect((await link(orderB))?.ok).toBe(false);
    expect((await db.query("SELECT * FROM work_txn_assignments")).rows).toHaveLength(1);
  });
  it("rejects duplicate orders", async () => {
    await link(orderA);
    expect((await link(orderA, open, [open]))?.ok).toBe(false);
    expect((await db.query("SELECT * FROM work_txn_assignments")).rows).toHaveLength(1);
  });
  it("rejects a foreign selected shift before writing anything", async () => {
    expect((await link(orderA, open, [foreign, open]))?.ok).toBe(false);
    expect((await db.query("SELECT * FROM work_txn_assignments")).rows).toHaveLength(0);
  });
  it("rejects an older recipient when a newer shift was selected", async () => {
    expect((await link(orderA, old))?.ok).toBe(false);
    expect((await db.query("SELECT * FROM work_txn_assignments")).rows).toHaveLength(0);
  });
  it("rolls back the assignment if saving the selected shifts fails", async () => {
    await db.exec(`CREATE FUNCTION fail_shift_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated update failure'; END; $$;
      CREATE TRIGGER fail_shift_update BEFORE UPDATE ON work_shifts FOR EACH ROW EXECUTE FUNCTION fail_shift_update();`);
    try {
      await expect(link(orderA)).rejects.toThrow("simulated update failure");
      expect((await db.query("SELECT * FROM work_txn_assignments")).rows).toHaveLength(0);
      expect((await db.query("SELECT id FROM work_shifts WHERE ended_reason = 'p2p_used'")).rows).toHaveLength(0);
    } finally {
      await db.exec("DROP TRIGGER fail_shift_update ON work_shifts; DROP FUNCTION fail_shift_update();");
    }
  });
});