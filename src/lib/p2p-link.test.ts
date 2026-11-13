import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const actor = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const adminUser = "00000000-0000-0000-0000-000000000003";
const old = "00000000-0000-0000-0000-000000000011";
const open = "00000000-0000-0000-0000-000000000012";
const foreign = "00000000-0000-0000-0000-000000000013";
const orderA = "00000000-0000-0000-0000-000000000021";
const orderB = "00000000-0000-0000-0000-000000000022";
let db: PGlite;
const sql = readFileSync(new URL("../../supabase/manual/p2p_shift_links_v2.sql", import.meta.url), "utf8");
async function link(order = orderA, selected = [old, open], user = actor) {
  return (await db.query<{ result: { ok: boolean } }>(
    "SELECT work_link_p2p_many($1,$2,$3::uuid[]) result", [order, user, selected])).rows[0]?.result;
}
async function hide(shift = old, hidden = true, user = actor) {
  return (await db.query<{ result: { ok: boolean } }>(
    "SELECT work_set_p2p_shift_hidden($1,$2,$3) result", [user, shift, hidden])).rows[0]?.result;
}
async function asUser<T>(user: string, query: string) {
  await db.query("SELECT set_config('test.uid',$1,false)", [user]);
  await db.exec("SET ROLE authenticated");
  try { return (await db.query<T>(query)).rows; }
  finally { await db.exec("RESET ROLE"); }
}
async function picker(user: string) {
  return asUser<{ id: string }>(user, `SELECT s.id FROM work_shifts s WHERE s.user_id=auth.uid()
    AND NOT EXISTS(SELECT 1 FROM work_p2p_hidden_shifts h WHERE h.user_id=auth.uid() AND h.shift_id=s.id AND h.hidden) ORDER BY s.id`);
}

describe("additive P2P linking and employee picker hiding", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT CASE WHEN current_user='authenticated' THEN 'authenticated' ELSE 'service_role' END $$;
      CREATE FUNCTION private.is_staff(uid uuid) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT uid IN ('${actor}'::uuid,'${other}'::uuid,'${adminUser}'::uuid) $$;
      CREATE FUNCTION private.is_admin(uid uuid) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT uid='${adminUser}'::uuid $$;
      GRANT USAGE ON SCHEMA auth,private TO authenticated,service_role;
      CREATE TABLE work_shifts(id uuid PRIMARY KEY,user_id uuid,started_at timestamptz NOT NULL,ended_at timestamptz,ended_reason text,link_group text,archived_at timestamptz);
      CREATE TABLE bybit_ledger(id uuid PRIMARY KEY,kind text,occurred_at timestamptz,amount numeric DEFAULT 20,detail jsonb DEFAULT '{"provider":"unchanged"}');
      CREATE TABLE work_txn_assignments(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,ledger_id uuid UNIQUE REFERENCES bybit_ledger(id),shift_id uuid REFERENCES work_shifts(id) ON DELETE SET NULL,
        user_id uuid,occurred_at timestamptz,kind text,assign_mode text,assigned_by uuid,assigned_at timestamptz DEFAULT now());
      GRANT SELECT ON work_shifts,work_txn_assignments,bybit_ledger TO authenticated;
    `);
    await db.exec(sql);
  });
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.exec("TRUNCATE work_p2p_audit,work_p2p_hidden_shifts,work_p2p_shift_links,work_txn_assignments,bybit_ledger,work_shifts CASCADE;");
    await db.query(`INSERT INTO work_shifts(id,user_id,started_at,ended_at,ended_reason,link_group) VALUES
      ($1,$4,'2026-11-12 10:00Z','2026-11-12 11:00Z','p2p_used','existing-group'),
      ($2,$4,'2026-11-13 10:00Z',NULL,NULL,'existing-group'),
      ($3,$5,'2026-11-11 10:00Z','2026-11-11 11:00Z',NULL,NULL)`, [old,open,foreign,actor,other]);
    await db.query("INSERT INTO bybit_ledger(id,kind,occurred_at) VALUES($1,'p2p_buy',now()),($2,'p2p_sell',now())", [orderA,orderB]);
  });
  it("links one order to every selected shift, not only the newest", async () => {
    expect(await link()).toEqual({ ok: true });
    expect((await db.query("SELECT shift_id FROM work_p2p_effective_links ORDER BY shift_id")).rows).toEqual([{ shift_id: old },{ shift_id: open }]);
  });
  it("reuses an ended shift for another P2P order", async () => {
    await link();
    expect(await link(orderB,[old,open])).toEqual({ ok: true });
    expect((await db.query("SELECT * FROM work_p2p_shift_links WHERE shift_id=$1",[old])).rows).toHaveLength(2);
  });
  it("linking never auto-hides or mutates any shift fields", async () => {
    const before = (await db.query("SELECT * FROM work_shifts ORDER BY id")).rows;
    await link();
    expect((await db.query("SELECT * FROM work_shifts ORDER BY id")).rows).toEqual(before);
    expect((await db.query("SELECT * FROM work_p2p_hidden_shifts")).rows).toHaveLength(0);
    expect(await picker(actor)).toEqual([{ id: old },{ id: open }]);
  });
  it("hiding affects only the employee's own picker", async () => {
    const beforeOther = await picker(other);
    expect(await hide()).toEqual({ ok: true });
    expect(await picker(actor)).toEqual([{ id: open }]);
    expect(await picker(other)).toEqual(beforeOther);
    expect((await asUser(actor,"SELECT * FROM work_p2p_hidden_shifts")).length).toBe(1);
    expect(await asUser(other,"SELECT * FROM work_p2p_hidden_shifts")).toEqual([]);
  });
  it("admin still sees the hidden shift and all its P2P links", async () => {
    await link(); await hide();
    expect((await asUser<{id:string}>(adminUser,"SELECT id FROM work_shifts ORDER BY id")).map(s=>s.id)).toEqual([old,open,foreign]);
    expect((await asUser(adminUser,"SELECT * FROM work_p2p_effective_links")).length).toBe(2);
  });
  it("unhide restores the shift and keeps hide/unhide audit", async () => {
    await hide(); await hide(old,false);
    expect(await picker(actor)).toEqual([{id:old},{id:open}]);
    expect((await db.query<{ action: string }>("SELECT action FROM work_p2p_audit ORDER BY created_at,id")).rows.map(r=>r.action).sort()).toEqual(["hide","unhide"]);
    expect((await db.query("SELECT hidden FROM work_p2p_hidden_shifts")).rows).toEqual([{hidden:false}]);
  });
  it("rejects hiding another employee's shift", async () => {
    expect((await hide(foreign))?.ok).toBe(false);
    expect((await db.query("SELECT * FROM work_p2p_hidden_shifts")).rows).toHaveLength(0);
  });
  it("rejects a mixed owned/foreign selection before any write", async () => {
    expect((await link(orderA,[old,foreign]))?.ok).toBe(false);
    expect((await db.query("SELECT * FROM work_txn_assignments")).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM work_p2p_shift_links")).rows).toHaveLength(0);
  });
  it("rejects nonstaff, empty selections, null shifts and non-P2P records", async () => {
    expect((await link(orderA,[old],"00000000-0000-0000-0000-000000000099"))?.ok).toBe(false);
    expect((await link(orderA,[]))?.ok).toBe(false);
    expect((await db.query<{result:{ok:boolean}}>("SELECT work_link_p2p_many($1,$2,ARRAY[NULL]::uuid[]) result",[orderA,actor])).rows[0]?.result.ok).toBe(false);
    await db.query("UPDATE bybit_ledger SET kind='card' WHERE id=$1",[orderA]);
    expect((await link())?.ok).toBe(false);
  });
  it("retries idempotently and can add another shift to the same order", async () => {
    await link(orderA,[old]); await link(orderA,[old]); await link(orderA,[open]);
    expect((await db.query("SELECT * FROM work_p2p_shift_links")).rows).toHaveLength(2);
    expect((await db.query("SELECT * FROM work_p2p_audit WHERE action='link'")).rows).toHaveLength(2);
    expect((await db.query("SELECT shift_id FROM work_txn_assignments")).rows).toEqual([{shift_id:old}]);
  });
  it("preserves ledger values and existing assignments with legacy history visible", async () => {
    await db.query("INSERT INTO work_txn_assignments(ledger_id,shift_id,user_id,occurred_at,kind,assign_mode,assigned_by) SELECT id,$2,$3,occurred_at,kind,'manual',$3 FROM bybit_ledger WHERE id=$1",[orderA,old,actor]);
    const assignment=(await db.query("SELECT * FROM work_txn_assignments")).rows;
    const ledger=(await db.query("SELECT * FROM bybit_ledger ORDER BY id")).rows;
    expect((await asUser(adminUser,"SELECT * FROM work_p2p_effective_links")).length).toBe(1);
    await link(orderA,[open]);
    expect((await db.query("SELECT * FROM work_txn_assignments")).rows).toEqual(assignment);
    expect((await db.query("SELECT * FROM bybit_ledger ORDER BY id")).rows).toEqual(ledger);
    expect((await asUser(adminUser,"SELECT * FROM work_p2p_effective_links")).length).toBe(2);
  });
  it("does not invent old links based on colour groups",async()=>{
    await db.query("INSERT INTO work_txn_assignments(ledger_id,shift_id,user_id,kind) VALUES($1,$2,$3,'p2p_buy')",[orderA,old,actor]);
    expect((await db.query("SELECT shift_id FROM work_p2p_effective_links")).rows).toEqual([{shift_id:old}]);
  });
  it("employee reads only their links, admin reads all, direct writes and RPC calls are denied",async()=>{
    await link(); await link(orderA,[foreign],other);
    expect((await asUser(actor,"SELECT * FROM work_p2p_effective_links")).length).toBe(2);
    expect((await asUser(other,"SELECT * FROM work_p2p_effective_links")).length).toBe(1);
    expect((await asUser(adminUser,"SELECT * FROM work_p2p_effective_links")).length).toBe(3);
    await expect(asUser(actor,`SELECT work_link_p2p_many('${orderA}','${other}',ARRAY['${foreign}']::uuid[])`)).rejects.toThrow("permission denied");
    await expect(asUser(actor,`INSERT INTO work_p2p_hidden_shifts VALUES('${actor}','${old}',true,now())`)).rejects.toThrow("permission denied");
    await expect(asUser(actor,"DELETE FROM work_p2p_audit")).rejects.toThrow("permission denied");
  });
  it("old RPC signature saves every selection without consuming shifts",async()=>{
    expect((await db.query<{result:{ok:boolean}}>("SELECT work_link_p2p_atomic($1,$2,$3,$4::uuid[]) result",[orderA,old,actor,[open]])).rows[0]?.result.ok).toBe(true);
    expect((await db.query("SELECT * FROM work_p2p_effective_links")).rows).toHaveLength(2);
    expect(await picker(actor)).toHaveLength(2);
  });
  it("rolls back links, compatibility assignment and audit if any audit write fails",async()=>{
    await db.exec(`CREATE FUNCTION fail_p2p_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated audit failure'; END $$;
      CREATE TRIGGER fail_p2p_audit BEFORE INSERT ON work_p2p_audit FOR EACH ROW EXECUTE FUNCTION fail_p2p_audit();`);
    try{
      await expect(link()).rejects.toThrow("simulated audit failure");
      expect((await db.query("SELECT * FROM work_p2p_shift_links")).rows).toHaveLength(0);
      expect((await db.query("SELECT * FROM work_txn_assignments")).rows).toHaveLength(0);
      await expect(hide()).rejects.toThrow("simulated audit failure");
      expect((await db.query("SELECT * FROM work_p2p_hidden_shifts")).rows).toHaveLength(0);
    }finally{await db.exec("DROP TRIGGER fail_p2p_audit ON work_p2p_audit; DROP FUNCTION fail_p2p_audit();");}
  });
});
