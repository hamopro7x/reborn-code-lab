import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** سجل السحب والإيداع عبر "التحويل الداخلي" في باي بت (Bybit UID transfers). */
export const getBybitInternalTransfers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ days: z.number().int().min(1).max(1095).default(90) }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "employee")) {
      throw new Error("Forbidden: staff only");
    }

    type Row = {
      id: string;
      coin: string;
      amount: number;
      fee: number;
      status: string;
      address: string;
      txId: string;
      at: number;
      createdAt: number;
      chain: string;
    };
    const empty = { configured: false as const, withdrawals: [] as Row[], deposits: [] as Row[], errors: [] as string[] };

    const apiKey = process.env["BYBIT_API_KEY"];
    const apiSecret = process.env["BYBIT_API_SECRET"];
    if (!apiKey || !apiSecret) return { ...empty, errors: ["missing keys"] };

    const { createHmac } = await import("node:crypto");
    const recv = "20000";

    async function call(path: string, params: Record<string, string>) {
      const qs = new URLSearchParams(params).toString();
      const ts = Date.now().toString();
      const sign = createHmac("sha256", apiSecret!).update(ts + apiKey! + recv + qs).digest("hex");
      const res = await fetch(`https://api.bybit.com${path}${qs ? `?${qs}` : ""}`, {
        headers: {
          Accept: "application/json",
          "X-BAPI-API-KEY": apiKey!,
          "X-BAPI-TIMESTAMP": ts,
          "X-BAPI-RECV-WINDOW": recv,
          "X-BAPI-SIGN": sign,
        },
      });
      const text = await res.text();
      let body: { retCode?: number; retMsg?: string; result?: Record<string, unknown> } = {};
      if (text.trim()) {
        try {
          body = JSON.parse(text) as typeof body;
        } catch {
          throw new Error(`${path} [${res.status}] invalid response`);
        }
      }
      if (!res.ok || body.retCode !== 0) {
        throw new Error(`${path} [${res.status}] ${body.retMsg ?? "request failed"}`);
      }
      return body.result ?? {};
    }

    const DAY = 24 * 60 * 60 * 1000;
    const CHUNK = 29 * DAY;
    const endTime = Date.now();
    const startTime = endTime - data.days * DAY;
    const errors: string[] = [];

    async function history(path: string, extra: Record<string, string> = {}) {
      const rows: any[] = [];
      let winEnd = endTime;
      while (winEnd > startTime && rows.length < 2000) {
        const winStart = Math.max(startTime, winEnd - CHUNK);
        let cursor = "";
        for (let page = 0; page < 20; page++) {
          const params: Record<string, string> = {
            ...extra,
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

    const [wdRes, depRes] = await Promise.allSettled([
      // withdrawType=1 => التحويل الداخلي فقط
      history("/v5/asset/withdraw/query-record", { withdrawType: "1" }),
      history("/v5/asset/deposit/query-internal-record"),
    ]);

    const withdrawals: Row[] =
      wdRes.status === "fulfilled"
        ? (wdRes.value ?? []).map((r: any) => ({
            id: String(r.withdrawId ?? r.txID ?? `${r.coin}-${r.createTime}`),
            coin: String(r.coin ?? ""),
            amount: Number(r.amount ?? 0),
            fee: Number(r.withdrawFee ?? 0),
            status: String(r.status ?? ""),
            address: String(r.toAddress ?? r.address ?? ""),
            txId: String(r.txID ?? r.txId ?? ""),
            at: Number(r.updateTime ?? r.createTime ?? 0),
            createdAt: Number(r.createTime ?? 0),
            chain: String(r.chain ?? ""),
          }))
        : [];
    if (wdRes.status === "rejected") errors.push(String(wdRes.reason?.message ?? wdRes.reason));

    const deposits: Row[] =
      depRes.status === "fulfilled"
        ? (depRes.value ?? []).map((r: any) => ({
            id: String(r.id ?? r.txID ?? `${r.coin}-${r.createdTime}`),
            coin: String(r.coin ?? ""),
            amount: Number(r.amount ?? 0),
            fee: 0,
            status: String(r.status ?? ""),
            address: String(r.address ?? ""),
            txId: String(r.txID ?? r.txId ?? ""),
            at: Number(r.createdTime ?? r.successAt ?? 0),
          }))
        : [];
    if (depRes.status === "rejected") errors.push(String(depRes.reason?.message ?? depRes.reason));

    withdrawals.sort((a, b) => b.at - a.at);
    deposits.sort((a, b) => b.at - a.at);

    return { configured: true as const, withdrawals, deposits, errors };
  });
