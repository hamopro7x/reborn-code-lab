import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server",async()=>{
  const {createClient}=await import("@supabase/supabase-js");
  return {supabaseAdmin:createClient("https://shift-test.supabase.co","test-key",{
    auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input)=>{
      const url=new URL(String(input));
      if(url.pathname.endsWith("/work_shifts")){
        const shift={id:"shift",user_id:"employee",started_at:"2026-11-01T00:00Z",ended_at:null};
        return new Response(JSON.stringify(url.searchParams.get("ended_at")==="is.null"?shift:[shift]),{headers:{"content-type":"application/json"}});
      }
      // Four nominal successes: purchase, string side2, numeric side2, waiting card.
      const filters=url.searchParams.getAll("bybit_ledger.detail");
      const visibility=url.searchParams.getAll("bybit_ledger.or").join(" ");
      const count=1+(filters.includes('not.cs.{"side":"2"}')?0:1)+(filters.includes('not.cs.{"side":2}')?0:1)+(visibility.includes("confirmationState")?0:1);
      return new Response(JSON.stringify(Array.from({length:count},()=>({shift_id:"shift"}))),{headers:{"content-type":"application/json","content-range":`0-${count-1}/${count}`}});
    }},
  })};
});
import {myWorkState,shiftHistory} from "./work.server";

describe("shift counts follow the same eligibility as shift rows",()=>{
  it("open shift excludes both side2 variants and unconfirmed cards",async()=>{
    expect((await myWorkState("employee")).txns).toBe(1);
  });
  it("shift history excludes both side2 variants and unconfirmed cards",async()=>{
    expect((await shiftHistory("employee"))[0].txns).toBe(1);
  });
});