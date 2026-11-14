import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

const state = vi.hoisted(() => ({ hidden: false, missing: false, calls: [] as string[] }));
const shifts = [
  { id: "old", user_id: "employee", started_at: "2026-11-12T10:00Z", ended_at: "2026-11-12T11:00Z", ended_reason: "p2p_used", link_group: "historic" },
  { id: "open", user_id: "employee", started_at: "2026-11-13T10:00Z", ended_at: null },
  { id: "foreign", user_id: "other", started_at: "2026-11-11T10:00Z", ended_at: null },
];
const links = [
  { id: "link-1", ledger_id: "order", shift_id: "old", user_id: "employee", started_at: shifts[0].started_at, source: "legacy-assignment" },
  { id: "link-2", ledger_id: "order", shift_id: "open", user_id: "employee", started_at: shifts[1].started_at, source: "explicit" },
  { id: "link-3", ledger_id: "order", shift_id: "foreign", user_id: "other", started_at: shifts[2].started_at, source: "explicit" },
];
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: createClient("https://p2p-test.supabase.co", "test", {
  auth: { persistSession: false }, global: { fetch: async (input) => {
    const url = new URL(String(input)); state.calls.push(url.pathname);
    const table = url.pathname.split("/").pop();
    if (state.missing && (table === "work_link_p2p_many" || table === "work_set_p2p_shift_hidden")) return new Response(JSON.stringify({code:"PGRST202"}),{status:404,headers:{"content-type":"application/json"}});
    if (state.missing && table === "work_p2p_hidden_shifts") return new Response(JSON.stringify({code:"PGRST205"}),{status:404,headers:{"content-type":"application/json"}});
    if (state.missing && table === "work_p2p_effective_links") return new Response(JSON.stringify({code:"PGRST205"}),{status:404,headers:{"content-type":"application/json"}});
    let data: any[] = [];
    if (table === "profiles") data = [{id:"employee",full_name:"Employee"},{id:"other",full_name:"Other"}];
    if (table === "work_shifts") data = shifts;
    if (table === "work_p2p_hidden_shifts") data = state.hidden ? [{user_id:"employee",shift_id:"old",hidden:true}] : [];
    if (table === "work_p2p_effective_links") data = links;
    if (table === "work_txn_assignments") data = state.missing ? [{...links[0],kind:"p2p_buy",work_shifts:shifts[0]}] : [];
    if (table === "bybit_ledger") data = [{id:"order",kind:"p2p_buy",status:"اكتملت",amount:20,occurred_at:"2026-11-13T10:00Z",detail:{}}, {id:"recent",kind:"p2p_buy",status:"اكتملت",amount:30,occurred_at:"2026-11-13T11:00Z",detail:{}}];
    for (const field of ["user_id","shift_id"]) {
      const filter=url.searchParams.get(field); if(filter?.startsWith("eq.")) data=data.filter(row=>row[field]===filter.slice(3));
    }
    for (const field of ["id","ledger_id"]) {
      const filter=url.searchParams.get(field);
      if(filter?.startsWith("in.(")) {
        const ids=filter.slice(4,-1).split(",");
        data=data.filter(row=>ids.includes(row[field]));
      }
    }
    return new Response(JSON.stringify(data),{headers:{"content-type":"application/json"}});
  } },
}) }));
vi.mock("./retention.server",()=>({ enforceRetentionSafe:vi.fn() }));
vi.mock("./account-labels.server",()=>({ accountLabels:async()=>new Map() }));
import { completedP2P, myShiftsForLink, shiftHistory, shiftP2P, linkP2P, setP2PShiftHidden } from "./work.server";

describe("P2P application reads",()=>{
  beforeEach(()=>{state.hidden=false;state.missing=false;state.calls=[];});
  it("recent employee inbox excludes previously linked orders as before the rollout",async()=>{
    expect((await completedP2P(200,"employee")).map(r=>r.ledgerId)).toEqual(["recent"]);
    expect((await completedP2P(200,"unrelated")).map(r=>r.ledgerId)).toEqual(["recent"]);
  });
  it("admin and legacy history retain previously linked orders",async()=>{
    expect((await completedP2P(200,"admin",true)).map(r=>r.ledgerId)).toEqual(["order","recent"]);
    state.missing=true;
    expect((await completedP2P(200,"employee")).map(r=>r.ledgerId)).toEqual(["recent"]);
    expect(await shiftP2P("old","employee")).toHaveLength(1);
  });
  it("picker hides only explicit hidden shifts, including restoration of previously used shifts",async()=>{
    expect((await myShiftsForLink("employee")).shifts.map(s=>s.id)).toEqual(["old","open"]);
    state.hidden=true;
    expect((await myShiftsForLink("employee")).shifts.map(s=>s.id)).toEqual(["open"]);
    expect((await myShiftsForLink("employee",true)).shifts.map(s=>s.id)).toEqual(["old"]);
    expect((await myShiftsForLink("other")).shifts.map(s=>s.id)).toEqual(["foreign"]);
  });
  it("admin history never queries employee visibility and counts links on every shift",async()=>{
    state.hidden=true;
    const history=await shiftHistory("employee");
    expect(history.map(s=>[s.id,s.txns])).toEqual([["old",1],["open",1]]);
    expect(state.calls.some(c=>c.endsWith("work_p2p_hidden_shifts"))).toBe(false);
  });
  it("admin sees every order link but employee sees only owned links",async()=>{
    const admin=await shiftP2P("old");
    expect(admin).toHaveLength(1);
    expect(admin[0].relatedShifts).toHaveLength(3);
    const employee=await shiftP2P("old","employee");
    expect(employee[0].relatedShifts).toHaveLength(2);
    expect(employee[0].relatedShifts.every((l:any)=>l.userId==="employee")).toBe(true);
  });
  it("unapplied schema reads legacy history without inferring colour-group links",async()=>{
    state.missing=true;
    const history=await shiftP2P("old","employee");
    expect(history).toHaveLength(1);
    expect(history[0].relatedShifts.map((l:any)=>l.shiftId)).toEqual(["old"]);
  });
  it("missing migration fails closed for linking/hiding and never calls the consuming legacy RPC",async()=>{
    state.missing=true;
    expect((await linkP2P("order",["old"],"employee")).ok).toBe(false);
    expect((await setP2PShiftHidden("employee","old",true)).ok).toBe(false);
    await expect(myShiftsForLink("employee")).rejects.toThrow("لسه مش متطبق");
    expect(state.calls.some(c=>c.endsWith("work_link_p2p_atomic"))).toBe(false);
  });
});