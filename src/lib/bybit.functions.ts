import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getBybitActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ days: z.number().int().min(1).max(1095).default(30) }).parse(data ?? {}))
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
      return { configured: false as const, accounts: [] as { type: string; label: string; kind: "internal" | "external"; coins: { coin: string; balance: number; usdValue: number }[]; totalUsd: number; spendingPower: number }[], balances: [], deposits: [], withdrawals: [], errors: ["missing keys"] };
    }
    const apiKey = key;
    const apiSecret = secret;

    const { createHmac } = await import("node:crypto");
    const recv = "20000";

    async function call(path: string, params: Record<string, string>) {
      const qs = new URLSearchParams(params).toString();
      const ts = Date.now().toString();
      const sign = createHmac("sha256", apiSecret).update(ts + apiKey + recv + qs).digest("hex");
      const res = await fetch(`https://api.bybit.com${path}${qs ? `?${qs}` : ""}`, {
        headers: {
          Accept: "application/json",
          "X-BAPI-API-KEY": apiKey,
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
        throw new Error(`${path} [${res.status}] ${body.retMsg ?? (text.trim() ? "request failed" : "empty response")}`);
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

      // Unified wallet endpoint gives real usdValue and لا يحتاج تحديد العملات.
      if (accountType === "UNIFIED") {
        try {
          const r = await call("/v5/account/wallet-balance", { accountType: "UNIFIED" });
          const coins = (((r["list"] as any[]) ?? [])[0]?.coin ?? []) as any[];
          const rich = coins.map((c) => ({
            coin: String(c.coin),
            balance: Number(c.walletBalance ?? 0),
            usdValue: Number(c.usdValue ?? 0),
          }));
          if (rich.length > 0) return rich;
        } catch (e) {
          const msg = String((e as Error).message);
          if (!/permission denied/i.test(msg)) errors.push(msg);
        }
      }

      // This endpoint accepts one coin per request, not a comma-separated list.
      // FUND can be queried without a coin; UNIFIED is queried coin-by-coin.
      if (accountType === "UNIFIED") {
        const supportedCoins = ["USDT", "USDC", "BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "MNT"];
        const attempts = await Promise.allSettled(
          supportedCoins.map((coin) =>
            call("/v5/asset/transfer/query-account-coins-balance", { accountType, coin }),
          ),
        );
        for (const attempt of attempts) {
          if (attempt.status !== "fulfilled") continue;
          const rows = ((attempt.value["balance"] as any[]) ?? []).map((c) => ({
            coin: String(c.coin),
            balance: Number(c.walletBalance ?? c.transferBalance ?? 0),
            usdValue: 0,
          }));
          out.push(...rows);
        }
      } else {
        try {
          const r2 = await call("/v5/asset/transfer/query-account-coins-balance", { accountType });
          const rows = ((r2["balance"] as any[]) ?? []).map((c) => ({
            coin: String(c.coin),
            balance: Number(c.walletBalance ?? c.transferBalance ?? 0),
            usdValue: 0,
          }));
          out.push(...rows);
        } catch (e) {
          errors.push(String((e as Error).message));
        }
      }
      return out;
    }

    // Public spot prices so الرصيد الداخلي (Funding) also shows a USD value.
    async function usdPrices(coins: string[]) {
      const map = new Map<string, number>();
      const stable = ["USDT", "USDC", "USD", "DAI", "FDUSD"];
      for (const c of coins) {
        if (stable.includes(c)) {
          map.set(c, 1);
          continue;
        }
        try {
          const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${c}USDT`);
          const body = (await res.json()) as any;
          const price = Number(body?.result?.list?.[0]?.lastPrice ?? 0);
          if (price > 0) map.set(c, price);
        } catch {
          // ignore price lookup failures
        }
      }
      return map;
    }

    // بطاقة Bybit تصرف من حساب التمويل (FUND) — فرصيده هو "الرصيد الداخلي"
    // الظاهر في لوحة البطاقة كـ Spending Power. UNIFIED = الرصيد الخارجي.
    async function accountsBalances() {
      const defs = [
        { type: "FUND", label: "الرصيد الداخلي للبطاقة (قوة الشراء)", kind: "internal" as const },
        { type: "UNIFIED", label: "الرصيد الخارجي (الحساب الموحّد)", kind: "external" as const },
      ];

      const raw = await Promise.all(
        defs.map(async (d) => ({ ...d, coins: (await coinsOf(d.type)).filter((c) => c.balance > 0) })),
      );
      const missing: string[] = [
        ...new Set(raw.flatMap((a) => a.coins.filter((c) => c.usdValue <= 0).map((c) => c.coin))),
      ];

      const prices = await usdPrices(missing);
      // باي بت بيخصم هامش تحويل ~1.4% على رصيد البطاقة، فقوة الشراء الفعلية أقل من الرصيد.
      const CARD_MARGIN = 0.014;
      return raw.map((a) => {
        const coins = a.coins.map((c) =>
          c.usdValue > 0 ? c : { ...c, usdValue: c.balance * (prices.get(c.coin) ?? 0) },
        );
        const totalUsd = coins.reduce((s, c) => s + c.usdValue, 0);
        return {
          ...a,
          coins,
          totalUsd,
          spendingPower: a.kind === "internal" ? totalUsd * (1 - CARD_MARGIN) : totalUsd,
        };
      });
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

// Live Bybit Card transactions from the official V5 card asset-record endpoint.
export const getBybitCardTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ since: z.number().int().positive() }).parse(data))
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
    const apiKey = key;
    const apiSecret = secret;

    const { createHmac } = await import("node:crypto");
    const recv = "20000";

    async function post(path: string, params: Record<string, string | number>) {
      const payload = JSON.stringify(params);
      const ts = Date.now().toString();
      const sign = createHmac("sha256", apiSecret).update(ts + apiKey + recv + payload).digest("hex");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      let res: Response;
      try {
        res = await fetch(`https://api.bybit.com${path}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-BAPI-API-KEY": apiKey,
            "X-BAPI-TIMESTAMP": ts,
            "X-BAPI-RECV-WINDOW": recv,
            "X-BAPI-SIGN": sign,
          },
          body: payload,
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("انتهت مهلة الاتصال بباي بت، حاول التحديث مرة أخرى");
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
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
        throw new Error(`${path} [${res.status}] ${body.retMsg ?? (text.trim() ? "request failed" : "empty response")}`);
      }
      return body.result ?? {};
    }

    const endTime = Date.now();
    const probeErrors: string[] = [];

    // Official Bybit Card V5 endpoint. It is a POST endpoint and uses numeric
    // pages (not the cursor pagination used by account/asset endpoints).
    const cardPath = "/v5/card/transaction/query-asset-records";
    type CardRow = {
      id: string;
      occurredAt: number;
      amount: number;
      currency: string;
      merchant: string;
      status: string;
      last4: string;
    };
    const cardRows: CardRow[] = [];
    // Only settled financial records are needed. Authorizations duplicate
    // purchases and querying every type quickly exhausts Bybit's rate limit.
    const cardQueryType = "SIDE_QUERY_FINANCIAL";

    const mapRow = (r: any, type: string, key: string): CardRow => ({
      id: String(r.txnId ?? r.orderNo ?? `${type}-${key}`),
      occurredAt: Number(r.txnCreate ?? r.createTime ?? r.txnTime ?? 0),
      amount: (type === "SIDE_QUERY_REFUND" ? 1 : -1) * Math.abs(Number(r.basicAmount ?? r.paidAmount ?? r.transactionAmount ?? 0)),
      currency: String(r.basicCurrency ?? r.paidCurrency ?? r.transactionCurrency ?? "USD"),
      merchant: String(r.merchName ?? r.merchCategoryDesc ?? "Card Transaction"),
      status: String(r.status ?? r.tradeStatus ?? "") === "1" ? "Successful" : String(r.status ?? r.tradeStatus ?? "") === "0" ? "Pending" : "Failed",
      last4: String(r.pan4 ?? "").slice(-4),
    });

    // One bounded request only: track transactions created after the local
    // monitoring start time and never scan historical pages.
    try {
      const result = await post(cardPath, {
        type: cardQueryType,
        limit: 100,
        page: 1,
        createBeginTime: data.since,
        createEndTime: endTime,
      });
      const batch = (result["data"] as any[]) ?? [];
      cardRows.push(
        ...batch
          .map((row, index) => mapRow(row, cardQueryType, `current-1-${index}`))
          .filter((row) => row.occurredAt >= data.since),
      );
    } catch (error) {
      probeErrors.push(String((error as Error).message));
    }

    if (cardRows.length > 0) {
      const unique = [...new Map(cardRows.map((row) => [row.id, row])).values()];
      unique.sort((a, b) => b.occurredAt - a.occurredAt);
      return { configured: true as const, source: cardPath, rows: unique, errors: [] };
    }


    console.warn("Bybit card transaction endpoints unavailable", probeErrors);
    return {
      configured: true as const,
      source: cardPath,
      rows: [],
      errors: probeErrors.length > 0 ? [probeErrors[0]] : [],
    };
  });
