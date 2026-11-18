import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";

const owner="00000000-0000-0000-0000-000000000001", employee="00000000-0000-0000-0000-000000000002", other="00000000-0000-0000-0000-000000000003", admin="00000000-0000-0000-0000-000000000004", customer="00000000-0000-0000-0000-000000000005";
let db: PGlite;
async function as<T>(user:string, sql:string, args:unknown[]=[]) {
  await db.query("SELECT set_config('test.uid',$1,false)",[user]); await db.exec("SET ROLE authenticated");
  try { return (await db.query<T>(sql,args)).rows; } finally { await db.exec("RESET ROLE"); }
}
async function mutate(user:string, action:string, payload:Record<string,unknown>={}) {
  return (await as<{result:{id:string;ok:boolean}}>(user,"SELECT staff_chat_mutate($1,$2::jsonb) result",[action,JSON.stringify(payload)]))[0]?.result;
}
async function send(user=owner,payload:Record<string,unknown>={}) {
  const result=await mutate(user,"send",{body:"message",...payload}); if(!result?.id) throw new Error("missing message"); return result.id;
}
async function read(user:string) { return (await as<{result:{id:string;body:string}[]}>(user,"SELECT staff_chat_read() result"))[0]?.result ?? []; }

describe("review-only internal group SQL policy and atomic actions",()=>{
  beforeAll(async()=>{
    db=new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA private; CREATE TYPE public.app_role AS ENUM('admin','employee','customer');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth,private TO authenticated,service_role;
      CREATE TABLE user_roles(user_id uuid,role app_role,created_at timestamptz DEFAULT now());
      CREATE TABLE profiles(id uuid,full_name text);
      CREATE TABLE work_shifts(id uuid PRIMARY KEY,user_id uuid,ended_at timestamptz);
      GRANT SELECT ON work_shifts TO authenticated; GRANT ALL ON work_shifts TO service_role;
      ALTER TABLE work_shifts ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION private.has_role(uid uuid,r app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=uid AND role=r)$$;
      CREATE FUNCTION private.is_admin(uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT private.has_role(uid,'admin')$$;
      CREATE FUNCTION private.is_staff(uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT private.has_role(uid,'admin') OR private.has_role(uid,'employee')$$;
      CREATE POLICY work_own_read ON work_shifts FOR SELECT TO authenticated USING(user_id=auth.uid() OR private.is_admin(auth.uid()));
      INSERT INTO user_roles VALUES('${owner}','admin',now()),('${employee}','employee',now()),('${other}','employee',now()),('${customer}','customer',now());
      INSERT INTO profiles VALUES('${owner}','Owner'),('${employee}','Employee'),('${other}','Other');`);
    await db.exec(readFileSync(new URL("../../supabase/manual/internal_group.sql",import.meta.url),"utf8"));
    await db.exec(readFileSync(new URL("../../supabase/manual/internal_group_targeted_read.sql",import.meta.url),"utf8"));
    await db.exec(readFileSync(new URL("../../supabase/manual/internal_group_any_file.sql",import.meta.url),"utf8"));
    await db.query("INSERT INTO user_roles VALUES($1,'admin',now())",[admin]);
  });
  afterAll(async()=>{await db.close();});
  beforeEach(async()=>{ await db.exec("TRUNCATE staff_chat_audit,staff_chat_hidden,staff_chat_votes,staff_chat_notifications,staff_chat_receipts,staff_chat_attachments,staff_chat_messages,work_shifts CASCADE; UPDATE staff_chat_group SET is_open=true;"); });
  it("fixed owner alone changes state; future admin never inherits ownership",async()=>{
    await expect(mutate(admin,"state",{open:false})).rejects.toThrow();
    await expect(mutate(employee,"state",{open:false})).rejects.toThrow();
    await mutate(owner,"state",{open:false});
    expect((await db.query<{is_open:boolean}>("SELECT is_open FROM staff_chat_group")).rows[0]?.is_open).toBe(false);
  });
  it("closed group disallows employee send but retains reads and admin send",async()=>{
    const id=await send(employee); await mutate(owner,"state",{open:false});
    await expect(send(employee)).rejects.toThrow("مغلق"); await send(admin);
    expect((await read(employee)).map(m=>m.id)).toContain(id);
  });
  it("customer cannot read or send and direct message writes are denied",async()=>{
    await expect(send(customer)).rejects.toThrow(); await expect(read(customer)).rejects.toThrow();
    await expect(as(employee,"INSERT INTO staff_chat_messages(sender_id,sender_name,body) VALUES(auth.uid(),'x','x')")).rejects.toThrow("permission denied");
    await expect(as(employee,"UPDATE staff_chat_group SET is_open=false")).rejects.toThrow("permission denied");
  });
  it("ordinary messages never block employees",async()=>{
    await send(); expect((await db.query<{blocked:boolean}>("SELECT staff_chat_blocked($1) blocked",[employee])).rows[0]?.blocked).toBe(false);
  });
  it("mandatory receipts persist offline; every pending message needs own server acknowledgment",async()=>{
    const a=await send(owner,{mandatory:true,mandatoryMentions:[employee]}),b=await send(owner,{mandatory:true,mandatoryMentions:[employee]});
    expect((await db.query("SELECT * FROM staff_chat_receipts WHERE user_id=$1 AND read_at IS NULL",[employee])).rows).toHaveLength(2);
    await mutate(other,"ack",{id:a});
    expect((await db.query("SELECT * FROM staff_chat_receipts WHERE user_id=$1 AND read_at IS NULL",[employee])).rows).toHaveLength(2);
    await expect(send(employee)).rejects.toThrow("قراءة"); await mutate(employee,"ack",{id:a});
    expect((await db.query<{blocked:boolean}>("SELECT staff_chat_blocked($1) blocked",[employee])).rows[0]?.blocked).toBe(true);
    await mutate(employee,"ack",{id:b});
    expect((await db.query<{blocked:boolean}>("SELECT staff_chat_blocked($1) blocked",[employee])).rows[0]?.blocked).toBe(false);
    const stamp=(await db.query<{read_at:string}>("SELECT read_at FROM staff_chat_receipts WHERE user_id=$1 AND message_id=$2",[employee,a])).rows[0]?.read_at;
    await mutate(employee,"ack",{id:a}); expect((await db.query<{read_at:string}>("SELECT read_at FROM staff_chat_receipts WHERE user_id=$1 AND message_id=$2",[employee,a])).rows[0]?.read_at).toEqual(stamp);
  });
  it("employees cannot mark mandatory or everyone and invalid mentions roll back",async()=>{
    await expect(send(employee,{mandatory:true})).rejects.toThrow(); await expect(send(employee,{everyone:true})).rejects.toThrow();
    await expect(send(employee,{body:"hi @everyone"})).rejects.toThrow(); await expect(send(employee,{mentions:[customer]})).rejects.toThrow();
    expect((await db.query("SELECT * FROM staff_chat_messages")).rows).toHaveLength(0);
  });
  it("mentions target one or several employees with private notification reads",async()=>{
    const id=await send(employee,{mentions:[other,employee]});
    expect((await as(other,"SELECT message_id FROM staff_chat_notifications")).map((r:any)=>r.message_id)).toEqual([id]);
    expect(await as(employee,"SELECT * FROM staff_chat_notifications")).toEqual([]);
    await send(owner,{everyone:true}); expect((await as(employee,"SELECT * FROM staff_chat_notifications")).length).toBe(1);
  });
  it("mandatory mentions block only selected employees, independently of ordinary everyone",async()=>{
    const id=await send(owner,{mandatory:true,mandatoryMentions:[employee],everyone:true});
    expect((await db.query("SELECT user_id FROM staff_chat_receipts WHERE message_id=$1",[id])).rows).toEqual([{user_id:employee}]);
    expect((await as<{result:{pending:{id:string}[]}}>(other,"SELECT staff_chat_status() result"))[0]?.result.pending).toEqual([]);
    expect((await as<{result:{pending:{id:string}[]}}>(employee,"SELECT staff_chat_status() result"))[0]?.result.pending.map(m=>m.id)).toEqual([id]);
    await send(other);
    await expect(send(employee)).rejects.toThrow("قراءة");
  });
  it("ordinary mentions never create mandatory receipts",async()=>{
    await send(owner,{mentions:[employee]});
    expect((await db.query("SELECT * FROM staff_chat_receipts")).rows).toEqual([]);
  });
  it("mandatory recipients must be explicitly selected valid employees",async()=>{
    for(const payload of [{mandatory:true},{mandatory:true,mandatoryMentions:[customer]}, {mandatory:true,mandatoryMentions:[admin]}, {mandatoryMentions:[employee]}]) {
      await expect(send(owner,payload)).rejects.toThrow();
    }
    await expect(send(employee,{mandatory:true,mandatoryMentions:[other]})).rejects.toThrow();
    expect((await db.query("SELECT * FROM staff_chat_messages")).rows).toEqual([]);
  });
  it("one mandatory message supports several recipients without duplicate receipts",async()=>{
    const id=await send(owner,{mandatory:true,mandatoryMentions:[employee,other,employee]});
    expect((await db.query("SELECT * FROM staff_chat_receipts WHERE message_id=$1",[id])).rows).toHaveLength(2);
  });
  it("reviewed upgrade preserves historical mandatory receipts and timestamps when reapplied",async()=>{
    const id=await send();
    await db.query("UPDATE staff_chat_messages SET mandatory=true,mandatory_mentions=NULL WHERE id=$1",[id]);
    await db.query("INSERT INTO staff_chat_receipts VALUES($1,$2,'2026-11-16T23:00:00Z'),($1,$3,NULL)",[id,employee,other]);
    const before=(await db.query("SELECT * FROM staff_chat_receipts ORDER BY user_id")).rows;
    await db.exec(readFileSync(new URL("../../supabase/manual/internal_group_targeted_read.sql",import.meta.url),"utf8"));
    expect((await db.query("SELECT * FROM staff_chat_receipts ORDER BY user_id")).rows).toEqual(before);
    expect((await as<{result:{pending:{id:string}[]}}>(other,"SELECT staff_chat_status() result"))[0]?.result.pending.map(m=>m.id)).toEqual([id]);
  });
  it("server sound cursor ignores the viewer's messages, edits and acknowledgments",async()=>{
    const status=async()=> (await as<{result:{incoming:{id:string}|null}}>(employee,"SELECT staff_chat_status() result"))[0]?.result.incoming;
    expect(await status()).toBeNull(); await send(employee); expect(await status()).toBeNull();
    const id=await send(owner,{mandatory:true,mandatoryMentions:[employee]});
    expect((await status())?.id).toBe(id);
    await mutate(owner,"edit",{id,body:"edited"}); await mutate(employee,"ack",{id});
    expect((await status())?.id).toBe(id);
  });
  it("own edit within an hour stores previous text; other admin cannot edit",async()=>{
    const id=await send(employee,{body:"original"}); await mutate(employee,"edit",{id,body:"changed"});
    expect((await read(owner)).find(m=>m.id===id)?.body).toBe("changed");
    expect((await db.query<{previous:{body:string}}>("SELECT previous FROM staff_chat_audit WHERE action='edit'")).rows[0]?.previous.body).toBe("original");
    await expect(mutate(owner,"edit",{id,body:"hijack"})).rejects.toThrow();
    expect(await as(employee,"SELECT * FROM staff_chat_audit")).toEqual([]);
  });
  it("after one hour neither employee nor admin edits their own message",async()=>{
    for(const user of [employee,owner]) {const id=await send(user); await db.query("UPDATE staff_chat_messages SET created_at=now()-interval '1 hour 1 second' WHERE id=$1",[id]); await expect(mutate(user,"edit",{id,body:"late"})).rejects.toThrow();}
  });
  it("only owner may hide locally or delete for everyone; history stays intact",async()=>{
    const id=await send(employee,{body:"history"});
    for(const user of [employee,admin]) for(const action of ["hide","delete"]) await expect(mutate(user,action,{id})).rejects.toThrow();
    await mutate(owner,"hide",{id}); expect((await read(owner)).find(m=>m.id===id)).toBeUndefined(); expect((await read(employee)).find(m=>m.id===id)?.body).toBe("history");
    await mutate(owner,"delete",{id}); expect((await read(employee)).find(m=>m.id===id)?.body).toBe("");
    expect((await db.query<{body:string}>("SELECT body FROM staff_chat_messages WHERE id=$1",[id])).rows[0]?.body).toBe("history");
    expect((await db.query("SELECT * FROM staff_chat_audit WHERE message_id=$1",[id])).rows).toHaveLength(2);
    await expect(as(employee,"SELECT body FROM staff_chat_messages")).rejects.toThrow("permission denied");
  });
  it("single-choice polls enforce valid choices and forbid repeat votes",async()=>{
    const id=await send(employee,{poll:{question:"Which?",options:["a","b"],multiple:false}});
    await expect(mutate(employee,"vote",{id,choices:[0,1]})).rejects.toThrow(); await expect(mutate(employee,"vote",{id,choices:[2]})).rejects.toThrow();
    await mutate(employee,"vote",{id,choices:[1]}); await expect(mutate(employee,"vote",{id,choices:[0]})).rejects.toThrow();
    expect((await as(owner,"SELECT user_id,choices FROM staff_chat_votes")).map((r:any)=>[r.user_id,r.choices])).toEqual([[employee,[1]]]);
  });
  it("multi-choice votes store one unique public employee ballot and time",async()=>{
    const id=await send(owner,{poll:{question:"Pick",options:["a","b","c"],multiple:true}}); await mutate(employee,"vote",{id,choices:[0,2,2]});
    const result=(await as<{choices:number[];voted_at:string}>(owner,"SELECT choices,voted_at FROM staff_chat_votes"))[0];
    expect(result?.choices).toEqual([0,2]); expect(result?.voted_at).toBeTruthy();
  });
  it("poll requires two distinct nonempty options",async()=>{
    for(const options of [["one"],["a","a"],["a",""]]) await expect(send(employee,{poll:{question:"Pick",options,multiple:false}})).rejects.toThrow();
  });
  it("any-file upgrade updates the legacy MIME guard without losing targeted recipients",async()=>{
    const row = (await db.query<{definition:string}>("SELECT pg_get_functiondef('public.staff_chat_mutate(text,jsonb)'::regprocedure) definition")).rows[0];
    if (!row) throw new Error("missing mutation function");
    await db.exec(row.definition.replace("'application/octet-stream',", ""));
    await expect(mutate(employee,"reserve",{name:"backup.7z",mime:"application/octet-stream",size:100})).rejects.toThrow();
    await db.exec(readFileSync(new URL("../../supabase/manual/internal_group_any_file.sql",import.meta.url),"utf8"));
    expect((await mutate(employee,"reserve",{name:"backup.7z",mime:"application/octet-stream",size:100}))?.id).toBeTruthy();
    const id = await send(owner,{mandatory:true,mandatoryMentions:[other]});
    expect((await db.query("SELECT user_id FROM staff_chat_receipts WHERE message_id=$1",[id])).rows).toEqual([{user_id:other}]);
  });
  it("unverified/foreign attachments cannot be sent and reservation enforces sizes/types",async()=>{
    await expect(mutate(employee,"reserve",{})).rejects.toThrow();
    expect((await mutate(employee,"reserve",{name:"x.exe",mime:"application/octet-stream",size:100}))?.id).toBeTruthy();
    await expect(mutate(employee,"reserve",{name:"x.png",mime:"image/png",size:26214401})).rejects.toThrow();
    const reserved=await mutate(employee,"reserve",{name:"x.png",mime:"image/png",size:8});
    await expect(send(employee,{attachments:[reserved?.id]})).rejects.toThrow();
    await expect(as(employee,"SELECT staff_chat_upload_ready($1,$2)",[reserved?.id,employee])).rejects.toThrow("permission denied");
    await db.query("SELECT staff_chat_upload_ready($1,$2)",[reserved?.id,employee]);
    await expect(send(other,{attachments:[reserved?.id]})).rejects.toThrow();
    const id=await send(employee,{attachments:[reserved?.id]}); expect((await db.query<{message_id:string}>("SELECT message_id FROM staff_chat_attachments WHERE id=$1",[reserved?.id])).rows[0]?.message_id).toBe(id);
    await expect(send(employee,{attachments:[reserved?.id]})).rejects.toThrow();
  });
  it("mandatory direct read guard hides work from employee but never changes shift or background assignment",async()=>{
    await db.query("INSERT INTO work_shifts VALUES($1,$1,NULL)",[employee]);
    expect(await as(employee,"SELECT id FROM work_shifts")).toHaveLength(1);
    const id=await send(owner,{mandatory:true,mandatoryMentions:[employee]});
    expect(await as(employee,"SELECT id FROM work_shifts")).toHaveLength(0);
    expect(await as(owner,"SELECT id FROM work_shifts")).toHaveLength(1);
    await db.exec("SET ROLE service_role");
    try { await db.query("INSERT INTO work_shifts VALUES($1,$2,NULL)",[other,employee]); expect((await db.query("SELECT * FROM work_shifts WHERE ended_at IS NULL")).rows).toHaveLength(2); }
    finally { await db.exec("RESET ROLE"); }
    await mutate(employee,"ack",{id}); expect(await as(employee,"SELECT id FROM work_shifts")).toHaveLength(2);
  });
  it("repeated mandatory status reads never write change events or lose pending receipts",async()=>{
    const id=await send(owner,{mandatory:true,mandatoryMentions:[employee]});
    const version=(await db.query<{version:number}>("SELECT version FROM staff_chat_events")).rows[0]?.version;
    for(let i=0;i<3;i++) {const status=(await as<{result:{pending:{id:string}[]}}>(employee,"SELECT staff_chat_status() result"))[0]?.result; expect(status?.pending.map(m=>m.id)).toEqual([id]);}
    expect((await db.query<{version:number}>("SELECT version FROM staff_chat_events")).rows[0]?.version).toBe(version);
  });
  it("history cursor preserves messages sharing one timestamp",async()=>{
    const a=await send(),b=await send(); await db.query("UPDATE staff_chat_messages SET created_at='2026-11-16T21:00:00Z'");
    const sorted=[a,b].sort();
    const rows=(await as<{result:{id:string}[]}>(employee,"SELECT staff_chat_read('2026-11-16T21:00:00Z',NULL,$1) result",[sorted[1]]))[0]?.result;
    expect(rows?.map(m=>m.id)).toEqual([sorted[0]]);
  });
});