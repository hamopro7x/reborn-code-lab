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
      return { configured: false as const, accounts: [] as { type: string; label: string; kind: "internal" | "external"; coins: { coin: string; balance: number; usdValue: number }[]; totalUsd: number }[], balances: [], deposits: [], withdrawals: [], errors: ["missing keys"] };
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

    // Balance: the "Wallet" account endpoint needs the Wallet permission which
    // read-only keys often lack, so fall back to the Assets endpoint across
    // account types. Only report an error if every attempt fails.
    async function coinsOf(accountType: string) {
      const out: { coin: string; balance: number; usdValue: number }[] = [];
      if (accountType === "UNIFIED") {
        try {
          const r = await call("/v5/account/wallet-balance", { accountType: "UNIFIED" });
          const coins = (((r["list"] as any[]) ?? [])[0]?.coin ?? []) as any[];
          for (const c of coins) {
            out.push({
              coin: String(c.coin),
              balance: Number(c.walletBalance ?? 0),
              usdValue: Number(c.usdValue ?? 0),
            });
          }
          if (out.some((c) => c.balance > 0)) return out;
        } catch (e) {
          errors.push(String((e as Error).message));
        }
      }
      try {
        const r2 = await call("/v5/asset/transfer/query-account-coins-balance", { accountType });
        return ((r2["balance"] as any[]) ?? []).map((c) => ({
          coin: String(c.coin),
          balance: Number(c.walletBalance ?? c.transferBalance ?? 0),
          usdValue: 0,
        }));
      } catch (e) {
        errors.push(String((e as Error).message));
      }
      return out;
    }

    // "الرصيد الداخلي" = حساب التمويل (Funding) الداخلي على بايبت
    // "الرصيد الخارجي" = الحساب الموحّد/التداول المرتبط بقوة الشراء للبطاقة
    async function accountsBalances() {
      const defs = [
        { type: "FUND", label: "الرصيد الداخلي (Funding)", kind: "internal" as const },
        { type: "UNIFIED", label: "الرصيد الخارجي (Unified)", kind: "external" as const },
      ];
      const results = await Promise.all(
        defs.map(async (d) => {
          const coins = (await coinsOf(d.type)).filter((c) => c.balance > 0);
          return {
            ...d,
            coins,
            totalUsd: coins.reduce((s, c) => s + c.usdValue, 0),
          };
        }),
      );
      return results;
    }

    const [balRes, depRes, wdRes] = await Promise.allSettled([
      accountsBalances(),
      history("/v5/asset/deposit/query-record"),
      history("/v5/asset/withdraw/query-record"),
    ]);

    const accounts = balRes.status === "fulfilled" ? balRes.value : [];
    const balances = accounts.flatMap((a) => a.coins);
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

    return { configured: true as const, accounts, balances, deposits, withdrawals, errors };
  });

// Live Bybit Card transactions (v5). Bybit does not document a single card
// endpoint publicly, so we probe the known v5 card paths with the same signed
// request flow and use whichever one the key is allowed to read.
export const getBybitCardTransactions = createServerFn({ method: "POST" })
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
      return { configured: false as const, source: "", rows: [], errors: ["missing keys"] };
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
    const endTime = Date.now();
    const startTime = endTime - data.days * DAY;
    const errors: string[] = [];

    const candidates = [
      "/v5/user/card/transactions",
      "/v5/user/card/transaction-record",
      "/v5/asset/card/transaction-record",
      "/v5/asset/card/query-record",
    ];

    for (const path of candidates) {
      try {
        const res = await call(path, {
          startTime: String(startTime),
          endTime: String(endTime),
          limit: "50",
        });
        const raw =
          ((res["rows"] as any[]) ?? (res["list"] as any[]) ?? (res["records"] as any[]) ?? []) as any[];
        const rows = raw.map((r, i) => ({
          id: String(r.id ?? r.orderId ?? r.txId ?? r.transactionId ?? `${path}-${i}`),
          occurredAt: Number(r.transTime ?? r.createTime ?? r.createdTime ?? r.time ?? 0),
          amount: Number(r.amount ?? r.transAmount ?? r.value ?? 0),
          currency: String(r.currency ?? r.coin ?? r.currencyCode ?? ""),
          merchant: String(r.merchant ?? r.merchantName ?? r.description ?? r.remark ?? ""),
          status: String(r.status ?? r.orderStatus ?? ""),
          last4: String(r.cardLast4 ?? r.last4 ?? r.cardNo ?? "").slice(-4),
        }));
        return { configured: true as const, source: path, rows, errors };
      } catch (e) {
        errors.push(String((e as Error).message));
      }
    }

    return { configured: true as const, source: "", rows: [], errors };
  });
