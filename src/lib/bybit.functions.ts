import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rangeSchema = z.object({
  days: z.number().int().min(1).max(1095).default(30),
});

export const getBybitActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => rangeSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "admin")) {
      throw new Error("Forbidden: admin only");
    }

    const key = process.env["BYBIT_API_KEY"];
    const secret = process.env["BYBIT_API_SECRET"];
    if (!key || !secret) {
      return { configured: false as const, balances: [], deposits: [], withdrawals: [], errors: ["missing keys"] };
    }

    const { createHmac } = await import("node:crypto");
    const recv = "20000";

    async function call(path: string, params: Record<string, string>) {
      const qs = new URLSearchParams(params).toString();
      const ts = Date.now().toString();
      const sign = createHmac("sha256", secret!).update(ts + key! + recv + qs).digest("hex");
      const res = await fetch(`https://api.bybit.com${path}${qs ? `?${qs}` : ""}`, {
        headers: {
          "X-BAPI-API-KEY": key!,
          "X-BAPI-TIMESTAMP": ts,
          "X-BAPI-RECV-WINDOW": recv,
          "X-BAPI-SIGN": sign,
        },
      });
      const body = (await res.json()) as { retCode?: number; retMsg?: string; result?: Record<string, unknown> };
      if (!res.ok || body.retCode !== 0) {
        throw new Error(`${path} [${res.status}] ${body.retMsg ?? "request failed"}`);
      }
      return body.result ?? {};
    }

    const DAY = 24 * 60 * 60 * 1000;
    const CHUNK = 29 * DAY; // Bybit allows max 30 days per request
    const endTime = Date.now();
    const startTime = endTime - data.days * DAY;
    const errors: string[] = [];

    // Walk backwards in <=30 day windows so older records are included too.
    async function history(path: string) {
      const rows: any[] = [];
      let winEnd = endTime;
      while (winEnd > startTime && rows.length < 2000) {
        const winStart = Math.max(startTime, winEnd - CHUNK);
        let cursor = "";
        for (let page = 0; page < 20; page++) {
          const params: Record<string, string> = {
            startTime: String(winStart),
            endTime: String(winEnd),
            limit: "50",
          };
          if (cursor) params["cursor"] = cursor;
          const res = await call(path, params);
          const batch = (res["rows"] as any[]) ?? [];
          rows.push(...batch);
          cursor = String(res["nextPageCursor"] ?? "");
          if (!cursor || batch.length === 0) break;
        }
        winEnd = winStart - 1;
      }
      return rows;
    }

    // Balance: try UNIFIED, then fall back to Funding account coins balance.
    async function balancesAny() {
      try {
        const r = await call("/v5/account/wallet-balance", { accountType: "UNIFIED" });
        const coins = (((r["list"] as any[]) ?? [])[0]?.coin ?? []) as any[];
        if (coins.length) return coins.map((c) => ({ coin: String(c.coin), balance: Number(c.walletBalance ?? 0), usdValue: Number(c.usdValue ?? 0) }));
      } catch (e) {
        errors.push(String((e as Error).message));
      }
      const r2 = await call("/v5/asset/transfer/query-account-coins-balance", { accountType: "FUND" });
      return (((r2["balance"] as any[]) ?? []) as any[]).map((c) => ({
        coin: String(c.coin),
        balance: Number(c.walletBalance ?? c.transferBalance ?? 0),
        usdValue: 0,
      }));
    }

    const [balRes, depRes, wdRes] = await Promise.allSettled([
      balancesAny(),
      history("/v5/asset/deposit/query-record"),
      history("/v5/asset/withdraw/query-record"),
    ]);

    const balances =
      balRes.status === "fulfilled"
        ? ((balRes.value as any[]) ?? []).filter((c: { balance: number }) => c.balance > 0)
        : [];
    if (balRes.status === "rejected") errors.push(String(balRes.reason?.message ?? balRes.reason));

    const deposits =
      depRes.status === "fulfilled"
        ? ((depRes.value as any[]) ?? []).map((r) => ({
            id: String(r.txID ?? r.txId ?? `${r.coin}-${r.successAt}`),
            coin: String(r.coin),
            amount: Number(r.amount ?? 0),
            status: String(r.status ?? ""),
            chain: String(r.chain ?? ""),
            at: Number(r.successAt ?? r.createdTime ?? 0),
          }))
        : [];
    if (depRes.status === "rejected") errors.push(String(depRes.reason?.message ?? depRes.reason));

    const withdrawals =
      wdRes.status === "fulfilled"
        ? ((wdRes.value as any[]) ?? []).map((r) => ({
            id: String(r.withdrawId ?? r.txID ?? Math.random()),
            coin: String(r.coin),
            amount: Number(r.amount ?? 0),
            fee: Number(r.withdrawFee ?? 0),
            status: String(r.status ?? ""),
            chain: String(r.chain ?? ""),
            at: Number(r.updateTime ?? r.createTime ?? 0),
          }))
        : [];
    if (wdRes.status === "rejected") errors.push(String(wdRes.reason?.message ?? wdRes.reason));

    return { configured: true as const, balances, deposits, withdrawals, errors };
  });
