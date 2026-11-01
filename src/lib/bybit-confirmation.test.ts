import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cardConfirmed } from "./bybit-confirmation";

const account = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const adminId = "00000000-0000-0000-0000-000000000003";
const ids = [
  ["3000000683626441","3000000683626471","3000000683640474",2.79],
  ["3000000683749966","3000000683750004","3000000683764413",3.61],
  ["3000000683935780","3000000683935812","3000000683972959",3.08],
] as const;
let db: PGlite;
async function ingest(rows: any[], acc=account) {
  await db.query("select bybit_ingest_confirmed($1,$2::jsonb)",[acc,JSON.stringify(rows)]);
}
const raw = (id: string, side="1", tradeStatus="1", amount=3.61, time=1793482427000) => ({
  txn_id:id,merchant:"PAYPAL *TIKTOK INC",pan4:"0540",amount,currency:"USD",status:side==="2"?"failed":"success",
  txn_time:time,txn_type:side,observed_at:new Date().toISOString(),detail:{side,tradeStatus,txnId:id,orderNo:`order-${id}`,paymentId:`pay-${id}`},
});
describe("durable Bybit confirmation and atomic reconciliation",()=>{
  beforeAll(async()=>{
    db=new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''test.actor'',true),'''')::uuid';
      CREATE TABLE user_roles(user_id uuid,role text);
      CREATE TABLE bybit_accounts(id uuid PRIMARY KEY);
      CREATE TABLE bybit_card_txns(account_id uuid,txn_id text,merchant text,amount numeric,currency text,status text,
        txn_time bigint,pan4 text,txn_type text,detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(account_id,txn_id));
      CREATE TABLE bybit_ledger(account_id uuid,ref_id text,kind text,status text,amount numeric,detail jsonb NOT NULL DEFAULT '{}');
      INSERT INTO bybit_accounts VALUES('${account}'),('${other}');
      INSERT INTO auth.users VALUES('${adminId}'); INSERT INTO user_roles VALUES('${adminId}','admin');`);
    await db.exec(readFileSync(new URL("../../supabase/manual/bybit_confirmation_reconciliation.sql",import.meta.url),"utf8"));
  });
  afterAll(async()=>{await db.close();});
  beforeEach(async()=>{await db.exec("TRUNCATE bybit_ingest_fences,bybit_reversal_audit,bybit_reversal_cases,bybit_ledger,bybit_card_txns; SELECT set_config('test.actor','',false)");});
  it("holds an ancient payment first fetched now; no ledger entry",async()=>{
    await ingest([raw("a")]);
    const r=(await db.query<any>("select * from bybit_card_txns")).rows[0];
    expect(cardConfirmed(r)).toBe(false);
    await db.exec(`INSERT INTO bybit_ledger VALUES('${account}','a','card','success',-3.61,'{}');`);
    expect((await db.query("select * from bybit_ledger")).rows).toHaveLength(0);
  });
  it("30 second boundary needs fresh observation, never elapsed time alone",()=>{
    const created_at="2026-11-01T00:00:00.000Z";
    expect(cardConfirmed({created_at,confirmed_at:"2026-11-01T00:00:29.999Z"},Date.parse("2026-11-01T00:01Z"))).toBe(false);
    expect(cardConfirmed({created_at,confirmed_at:"2026-11-01T00:00:30.000Z"},Date.parse("2026-11-01T00:01Z"))).toBe(true);
    expect(cardConfirmed({created_at},Date.parse("2026-11-01T01:00Z"))).toBe(false);
  });
  it("replay preserves first_seen and stale fetch cannot replace status",async()=>{
    const r=raw("a"); await ingest([r]);
    const before=(await db.query<any>("select created_at from bybit_card_txns")).rows[0].created_at;
    await ingest([{...r,detail:{...r.detail,tradeStatus:"2"}}]);
    const after=(await db.query<any>("select * from bybit_card_txns")).rows[0];
    expect(after.created_at).toEqual(before); expect(after.detail.tradeStatus).toBe("1");
    await db.exec("UPDATE bybit_card_txns SET created_at=created_at-interval '1 hour'");
    expect((await db.query<any>("select created_at from bybit_card_txns")).rows[0].created_at).toEqual(before);
  });
  for(const [a,b,e,amount] of ids) it(`21 minute event ${amount}: different IDs need review on two accounts`,async()=>{
    for(const acc of [account,other]) await ingest([raw(a,"1","1",amount),raw(b,"1","0",amount,1793482430000),raw(e,"2","1",amount,1793482427000+21*60000)],acc);
    const cases=(await db.query<any>("select * from bybit_reversal_cases order by account_id")).rows;
    expect(cases).toHaveLength(2);
    expect(cases[0].candidate_ids).toEqual([a,b]); expect(cases[0].target_id).toBeNull();
    await db.query("SELECT set_config('test.actor',$1,false)",[adminId]);
    await db.query("select bybit_resolve_case($1,$2,$3,$4::text[],'manual-user-20261101')",[account,e,a,[a,b]]);
    await ingest([raw(a,"1","1",amount),raw(b,"1","0",amount,1793482430000),raw(e,"2","1",amount,1793482427000+21*60000)]);
    expect((await db.query<any>("select state,target_id from bybit_reversal_cases where account_id=$1",[account])).rows[0]).toEqual({state:"resolved",target_id:a});
    expect((await db.query<any>("select state from bybit_reversal_cases where account_id=$1",[other])).rows[0].state).toBe("needs_review");
    expect((await db.query<any>("select source from bybit_reversal_audit")).rows[0].source).toBe("manual-user-20261101");
  });
  it("non-admin decision is rejected atomically",async()=>{
    await ingest([raw("a"),raw("e","2")]);
    await expect(db.query("select bybit_resolve_case($1,'e','a',ARRAY['a'])",[account])).rejects.toThrow("Forbidden");
    expect((await db.query("select * from bybit_reversal_audit")).rows).toHaveLength(0);
  });
  it("old confirmed manual outcome survives provider refresh",async()=>{
    const a=raw(ids[0][0]); a.detail={...a.detail,linkedBy:"manual-20261031",linkedReversal:1} as any;
    await ingest([a]); await ingest([raw(ids[0][0])]);
    expect((await db.query<any>("select detail from bybit_card_txns")).rows[0].detail.linkedBy).toBe("manual-20261031");
  });
  it("confirmation and ledger/shift status survive concurrent replay and admin resolution",async()=>{
    // Fixture inserts model first_seen in the past; application updates cannot do this.
    await db.query(`INSERT INTO bybit_card_txns(account_id,txn_id,merchant,amount,currency,status,txn_time,pan4,txn_type,detail,created_at)
      VALUES($1,'a','PAYPAL *TIKTOK INC',3.61,'USD','success',1793482427000,'0540','1',
      '{"side":"1","tradeStatus":"1"}',clock_timestamp()-interval '31 seconds'),
      ($1,'b','PAYPAL *TIKTOK INC',3.61,'USD','failed',1793482430000,'0540','1',
      '{"side":"1","tradeStatus":"0","linkedReversal":1}',clock_timestamp()-interval '31 seconds')`,[account]);
    await ingest([raw("a"),raw("b","1","0",3.61,1793482430000),raw("e","2","1",3.61,1793482427000+21*60000)]);
    await db.exec(`INSERT INTO bybit_ledger VALUES('${account}','a','card','success',-3.61,'{}'),('${account}','b','card','success',-3.61,'{}')`);
    expect((await db.query<any>("select status from bybit_ledger")).rows.map((r)=>r.status)).toEqual(["review","review"]);
    await db.query("SELECT set_config('test.actor',$1,false)",[adminId]);
    await db.query("select bybit_resolve_case($1,'e','a',ARRAY['a','b'])",[account]);
    await Promise.all([ingest([raw("a"),raw("b","1","0",3.61,1793482430000)]),ingest([raw("a")])]);
    const statuses=(await db.query<any>("select ref_id,status,detail from bybit_ledger order by ref_id")).rows;
    expect(statuses.map((r)=>[r.ref_id,r.status])).toEqual([["a","reversed"],["b","success"]]);
    expect(statuses[1].detail.linkedReversal).toBeUndefined();
    expect((await db.query("select * from bybit_ledger where status='success'")).rows).toHaveLength(1);
    await db.query("select bybit_resolve_case($1,'e','a',ARRAY['a','b'])",[account]);
    expect((await db.query("select * from bybit_reversal_audit")).rows).toHaveLength(1);
    await expect(db.query("select bybit_resolve_case($1,'e','b',ARRAY['a','b'])",[account])).rejects.toThrow("decision already saved");
  });
  it("legacy sticky flags stay in review; no mass flip",async()=>{
    const r=raw("legacy"); r.detail={...r.detail,linkedReversal:1} as any;
    await ingest([r]);
    const c=(await db.query<any>("select * from bybit_reversal_cases")).rows[0];
    expect(c.event_id).toBe("legacy:legacy"); expect(c.state).toBe("needs_review");
    expect((await db.query<any>("select detail from bybit_card_txns")).rows[0].detail.projectedStatus).toBe("review");
  });
  it("shared provider ID resolves only one authorization; side2 is never inserted in ledger",async()=>{
    const a=raw("a"); const e=raw("e","2"); e.detail.orderNo=a.detail.orderNo;
    await ingest([a,e]);
    expect((await db.query<any>("select target_id,source from bybit_reversal_cases")).rows[0]).toEqual({target_id:"a",source:"provider-shared-id"});
    await db.exec(`INSERT INTO bybit_ledger VALUES('${account}','e','card','failed',-3.61,'{}')`);
    expect((await db.query("select * from bybit_ledger")).rows).toHaveLength(0);
  });
});