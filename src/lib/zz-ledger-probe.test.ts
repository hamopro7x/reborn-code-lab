import { test } from "vitest";
test("ledger reads", async () => {
  const m = await import("./bybit.server");
  const w = await import("./work.server");
  for (const g of ["txns", "p2p"]) for (const s of ["all", "success", "failed"]) for (const p of [1, 4]) {
    try { const r = await m.fetchLedgerPage({ group: g, status: s, page: p, pageSize: 50 }); console.log("L", g, s, p, "ok", r.total, r.rows.length); }
    catch (e: any) { console.log("L", g, s, p, "ERR", e.message); }
  }
  for (const fn of Object.keys(w)) if (/list.*txn|assign/i.test(fn)) console.log("fn", fn);
}, 120000);
