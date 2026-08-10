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
    if (!(roles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "employee")) {
      throw new Error("Forbidden: staff only");
    }

    const key = process.env["BYBIT_API_KEY"];
    const secret = process.env["BYBIT_API_SECRET"];
    if (!key || !secret) {
      return { configured: false as const, accounts: [] as { type: string; label: string; kind: "internal" | "external"; coins: { coin: string; balance: number; usdValue: number }[]; totalUsd: number; fiatUsd: number; cryptoUsd: number; spendingPower: number }[], balances: [], deposits: [], withdrawals: [], errors: ["missing keys"] };
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
          // بطاقة باي بت تصرف من الرصيد القابل للتحويل (transferBalance) وليس
          // رصيد المحفظة الكامل، فهو الأساس لحساب قوة الشراء.
          const rows = ((r2["balance"] as any[]) ?? []).map((c) => ({
            coin: String(c.coin),
            balance: Number(c.transferBalance ?? c.walletBalance ?? 0),
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

    // باي بت لا توفّر endpoint لقوة شراء البطاقة (كل مسارات /v5/card/*balance
    // ترجع 404)، فنحسبها من الرصيد القابل للصرف بعد هامش التحويل.

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
      // باي بت لا توفّر أي endpoint لرصيد البطاقة (كل مسارات /v5/card/*balance
      // ترجع 404)، لذا نحسب "الرصيد المتاح" من الرصيد القابل للصرف في حساب
      // التمويل بنفس سعر تحويل البطاقة الفعلي المعاير من شاشة البطاقة نفسها
      // (USD 389.42 مقابل USDT 393.97 = 0.987258 لكل دولار).
      const CARD_RATE = 0.987258;
      return raw.map((a) => {
        const coins = a.coins.map((c) =>
          c.usdValue > 0 ? c : { ...c, usdValue: c.balance * (prices.get(c.coin) ?? 0) },
        );
        const totalUsd = coins.reduce((s, c) => s + c.usdValue, 0);
        const isFiat = (coin: string) => /^USD$/i.test(coin);
        // تفصيل الرصيد المتاح كما تعرضه شاشة بطاقة باي بت: Fiat + Crypto
        const fiatUsd = coins
          .filter((c) => isFiat(c.coin))
          .reduce((s, c) => s + c.usdValue, 0);
        const cryptoUsd = coins
          .filter((c) => !isFiat(c.coin))
          .reduce((s, c) => s + c.usdValue * CARD_RATE, 0);
        const estimated = fiatUsd + cryptoUsd;


        return {
          ...a,
          coins,
          totalUsd,
          fiatUsd: a.kind === "internal" ? fiatUsd : 0,
          cryptoUsd: a.kind === "internal" ? cryptoUsd : totalUsd,
          spendingPower: a.kind === "internal" ? estimated : totalUsd,
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
            fee: Number(r.depositFee ?? 0),
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
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "employee")) {
      throw new Error("Forbidden: staff only");
    }

    const key = process.env["BYBIT_API_KEY"];
    const secret = process.env["BYBIT_API_SECRET"];
    if (!key || !secret) {
      return { configured: false as const, source: "", rows: [], balance: { usd: 0, fiatUsd: 0, cryptoUsd: 0, source: "" }, errors: ["missing keys"] };
    }
    const apiKey = key;
    const apiSecret = secret;

    const { data: trackingSetting } = await context.supabase
      .from("site_settings")
      .select("value")
      .eq("key", "bybit_card_tracking")
      .maybeSingle();
    const trackingValue = trackingSetting?.value as { started_at?: number } | null;
    const trackingStart = Number(trackingValue?.started_at ?? Date.now());

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

    async function get(path: string, params: Record<string, string | number>) {
      const query = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ).toString();
      const ts = Date.now().toString();
      const sign = createHmac("sha256", apiSecret).update(ts + apiKey + recv + query).digest("hex");
      const res = await fetch(`https://api.bybit.com${path}${query ? `?${query}` : ""}`, {
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
        throw new Error(`${path} [${res.status}] ${body.retMsg ?? "request failed"}`);
      }
      return body.result ?? {};
    }

    /**
     * رصيد البطاقة يُقرأ من نفس نداء المعاملات (نفس المصدر/نفس الصفحة).
     * أولاً نجرّب مسارات رصيد البطاقة الرسمية، وإن لم تتوفر نحسب الرصيد
     * المتاح من حساب التمويل (الذي تصرف منه البطاقة) بسعر تحويل البطاقة.
     */
    async function cardBalance() {
      const CARD_RATE = 0.987258;
      const pick = (node: any, keys: string[]): number => {
        for (const k of keys) {
          const v = Number(node?.[k]);
          if (Number.isFinite(v) && v !== 0) return v;
        }
        return 0;
      };
      for (const p of [
        "/v5/card/query-account-balance",
        "/v5/card/spending/query-balance",
        "/v5/card/query-card-balance",
      ]) {
        try {
          const r: any = await post(p, {});
          const node = r?.["balance"] ?? r?.["data"] ?? r;
          const usd = pick(node, ["availableBalance", "spendingPower", "available", "balance", "totalAvailable"]);
          if (usd > 0) {
            const fiatUsd = pick(node, ["fiatBalance", "fiatAvailable", "fiatAmount"]);
            const cryptoUsd = pick(node, ["cryptoBalance", "cryptoAvailable", "cryptoAmount"]) || Math.max(usd - fiatUsd, 0);
            return { usd, fiatUsd, cryptoUsd, source: p };
          }
        } catch {
          // try next card balance path
        }
      }

      // fallback: FUND (الحساب الذي تصرف منه البطاقة)
      let fiatUsd = 0;
      let cryptoUsd = 0;
      for (const coin of ["USD", "USDT", "USDC", "BTC", "ETH"]) {
        try {
          const r: any = await get("/v5/asset/transfer/query-account-coins-balance", {
            accountType: "FUND",
            coin,
            withBonus: 0,
          });
          for (const c of (r?.balance ?? []) as any[]) {
            const amount = Number(c.transferBalance ?? c.walletBalance ?? 0);
            if (!(amount > 0)) continue;
            if (/^USD$/i.test(String(c.coin))) fiatUsd += amount;
            else if (/^USD[TC]$/i.test(String(c.coin))) cryptoUsd += amount * CARD_RATE;
            else cryptoUsd += 0;
          }
        } catch {
          // ignore this coin
        }
      }
      return { usd: fiatUsd + cryptoUsd, fiatUsd, cryptoUsd, source: "FUND" };
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
      brand: string;
      cardKind: string;
      /** تفاصيل إضافية مطابقة لصفحة تفاصيل المعاملة في باي بت */
      txnType: string;
      paymentId: string;
      points: string;
      settlementDate: string;
      settleAmount: string;
      settleCurrency: string;
      authAmount: string;
      mcc: string;
      mccDesc: string;
      location: string;
      merchantEmail: string;
      merchantWebsite: string;
    };

    const cardRows: CardRow[] = [];
    // Authorizations are captured too so a transaction is recorded the moment
    // it is detected (before it settles); settled records overwrite them.
    const cardQueryType = "SIDE_QUERY_FINANCIAL";
    // Bybit's exact authorization enum is SIDE_QUERY_AUTH (not
    // SIDE_QUERY_AUTHORIZATION). Include refunds so every new card event is
    // captured without looking further back than the local tracking start.
    const cardQueryTypes = ["SIDE_QUERY_AUTH", cardQueryType, "SIDE_QUERY_REFUND"];

    // Real brand per card, taken from Bybit's own card list (last4 -> brand).
    // Guessing from the last 4 digits is wrong (the network is decided by the
    // BIN, i.e. the FIRST digit), which is why cards showed as Visa by mistake.
    const cardBrandByLast4 = new Map<string, string>();
    const cardKindByLast4 = new Map<string, string>();
    // These two cards were verified against the account's Bybit Card screen.
    // Keep this authoritative correction after the API mapping because some
    // transaction responses return the funding network instead of card scheme.
    const verifiedBrandByLast4 = new Map<string, string>([
      ["3256", "visa"],
      ["8331", "mastercard"],
    ]);
    const brandFromRaw = (raw: string): string => {
      const v = raw.trim().toLowerCase();
      if (/master\s*card|master|\bmc\b/.test(v)) return "mastercard";
      if (v.includes("visa")) return "visa";
      return "";
    };
    const cardListFrom = (value: unknown): any[] => {
      if (Array.isArray(value)) return value;
      if (!value || typeof value !== "object") return [];
      const node = value as Record<string, unknown>;
      for (const key of ["list", "rows", "cards", "data", "cardList", "cardInfoList"]) {
        const found = cardListFrom(node[key]);
        if (found.length > 0) return found;
      }
      return [];
    };
    try {
      for (const p of ["/v5/card/query-card-list", "/v5/card/query-card-info"]) {
        try {
          const r: any = await post(p, {});
           const list = cardListFrom(r);
          for (const c of list ?? []) {
             const l4 = String(c.pan4 ?? c.last4 ?? c.cardLast4 ?? c.cardNo ?? c.maskPan ?? c.maskedPan ?? "")
               .replace(/\D/g, "")
               .slice(-4);
            if (!l4) continue;
            const brand =
               brandFromRaw(String(c.cardBrand ?? c.brand ?? c.cardOrg ?? c.cardScheme ?? c.cardNetwork ?? c.organization ?? "")) ||
              (/^5|^2/.test(String(c.cardBin ?? c.bin ?? "")) ? "mastercard" : /^4/.test(String(c.cardBin ?? c.bin ?? "")) ? "visa" : "");
            if (brand) cardBrandByLast4.set(l4, brand);
            const kind = String(c.cardType ?? c.cardCategory ?? c.cardKind ?? "").toLowerCase();
            if (kind.includes("virt")) cardKindByLast4.set(l4, "virtual");
            else if (kind.includes("phys")) cardKindByLast4.set(l4, "physical");
          }
          for (const [last4, brand] of verifiedBrandByLast4) {
            cardBrandByLast4.set(last4, brand);
          }
          if (cardBrandByLast4.size > 0) break;
        } catch {
          // try the next card endpoint
        }
      }
    } catch {
      // card list unavailable — fall back to per-transaction fields
    }

    const brandOf = (r: any, last4: string): string => {
      const verified = verifiedBrandByLast4.get(last4);
      if (verified) return verified;
      const mapped = cardBrandByLast4.get(last4);
      if (mapped) return mapped;
      const raw = brandFromRaw(
        String(r.cardBrand ?? r.brand ?? r.cardOrg ?? r.cardScheme ?? r.cardNetwork ?? ""),
      );
      if (raw) return raw;
      const bin = String(r.cardBin ?? r.bin ?? "");
      if (/^5|^2/.test(bin)) return "mastercard";
      if (/^4/.test(bin)) return "visa";
      // Unknown network — let the UI render a neutral badge instead of a wrong logo.
      return "";
    };


    const kindOf = (r: any, last4 = ""): string => {
      const raw = String(r.cardType ?? r.cardCategory ?? r.cardKind ?? r.entity ?? "").toLowerCase();
      if (raw.includes("virt") || raw === "1") return "virtual";
      if (raw.includes("phys") || raw === "2") return "physical";
      return cardKindByLast4.get(last4) ?? "";
    };

    const num2 = (v: unknown): string => {
      const n = Number(v);
      if (!Number.isFinite(n) || v === null || v === undefined || v === "") return "";
      return n.toFixed(2);
    };
    const dateStr = (v: unknown): string => {
      const s = String(v ?? "").trim();
      if (!s) return "";
      if (/^\d{10,13}$/.test(s)) {
        const ms = s.length === 10 ? Number(s) * 1000 : Number(s);
        return new Date(ms).toISOString().slice(0, 10);
      }
      return s.slice(0, 10);
    };

    const mapRow = (r: any, type: string, key: string): CardRow => {
       const last4 = String(r.pan4 ?? r.last4 ?? r.cardLast4 ?? r.cardNo ?? r.maskPan ?? "")
         .replace(/\D/g, "")
         .slice(-4);
      const city = String(r.merchCity ?? r.merchantCity ?? r.city ?? "").trim();
      const country = String(r.merchCountry ?? r.merchantCountry ?? r.country ?? "").trim();
      return {
        id: String(r.txnId ?? r.orderNo ?? `${type}-${key}`),
        occurredAt: Number(r.txnCreate ?? r.createTime ?? r.txnTime ?? 0),
        amount: (type === "SIDE_QUERY_REFUND" ? 1 : -1) * Math.abs(Number(r.basicAmount ?? r.paidAmount ?? r.transactionAmount ?? 0)),
        currency: String(r.basicCurrency ?? r.paidCurrency ?? r.transactionCurrency ?? "USD"),
        merchant: String(r.merchName ?? r.merchCategoryDesc ?? "Card Transaction"),
        status: String(r.status ?? r.tradeStatus ?? "") === "1" ? "Successful" : String(r.status ?? r.tradeStatus ?? "") === "0" ? "Pending" : "Failed",
        last4,
        brand: brandOf(r, last4),
        cardKind: kindOf(r, last4),
        txnType: String(r.txnType ?? r.transactionType ?? r.bizType ?? (type === "SIDE_QUERY_REFUND" ? "Refund" : "Purchase")),
        paymentId: String(r.paymentId ?? r.payId ?? r.orderNo ?? ""),
        points: String(r.points ?? r.point ?? r.pointsEarned ?? r.rewardPoints ?? r.rewardPoint ?? ""),
        settlementDate: dateStr(r.settleDate ?? r.settlementDate ?? r.settleTime ?? r.postDate ?? ""),
        // مبلغ التسوية بعملة التسوية (وليس نفس مبلغ المعاملة)
        settleAmount: num2(r.settleAmount ?? r.settlementAmount ?? r.payAmount ?? ""),
        settleCurrency: String(
          r.settleCurrency ?? r.settlementCurrency ?? r.payCurrency ?? r.paidCurrency ?? "",
        ),
        authAmount: num2(r.authAmount ?? r.transactionAmount ?? r.basicAmount ?? ""),
        mcc: String(r.mcc ?? r.merchCategoryCode ?? ""),
        mccDesc: String(r.merchCategoryDesc ?? r.mccDesc ?? ""),
        location: [city, country].filter(Boolean).join(", "),
        merchantEmail: String(r.merchEmail ?? r.merchantEmail ?? r.contactEmail ?? ""),
        merchantWebsite: String(r.merchWebsite ?? r.merchantWebsite ?? r.merchUrl ?? r.contactWebsite ?? ""),
      };
    };



    // السجل دائم: نجلب أوسع نافذة يسمح بها Bybit (٢٩ يوم) ولا نستبعد أي معاملة
    // بسبب وقت بدء المتابعة، عشان الأرشيف يفضل كامل ومحصلة الإنفاق متنقصش.
    // Bybit accepts slightly different parameter shapes for this endpoint
    // depending on account region/version, so try known-valid shapes in order
    // and stop at the first one the API accepts (avoids param_illegal loops).
    const begin = endTime - 29 * 24 * 60 * 60 * 1000;
    const shapes = (type: string): Record<string, string | number>[] => [
      { type, page: 1, limit: 100, createBeginTime: String(begin), createEndTime: String(endTime) },
      { type, page: "1", limit: "100" },
      { type },
      { type, page: 1, limit: 100, beginTime: String(begin), endTime: String(endTime) },
    ];


    for (const type of cardQueryTypes) {
      let lastError = "";
      for (const params of shapes(type)) {
        try {
          const result = await post(cardPath, params);
          const batch = ((result["data"] ?? result["list"] ?? result["rows"]) as any[]) ?? [];
          cardRows.push(
            ...batch
              .map((row, index) => mapRow(row, type, `${type}-1-${index}`))
              .filter((row) => row.occurredAt >= trackingStart),
          );
          lastError = "";
          break;
        } catch (error) {
          lastError = String((error as Error).message);
          // Only keep probing when the failure is a parameter contract issue.
          if (!/param_illegal|params error|invalid request/i.test(lastError)) break;
        }
      }
      if (lastError) probeErrors.push(lastError);
    }

    // نفس النداء يرجع الرصيد المتاح في البطاقة أيضًا
    const balance = await cardBalance().catch(() => ({ usd: 0, fiatUsd: 0, cryptoUsd: 0, source: "" }));

    if (cardRows.length > 0) {
      const unique = [...new Map(cardRows.map((row) => [row.id, row])).values()];
      unique.sort((a, b) => b.occurredAt - a.occurredAt);

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: saveError } = await supabaseAdmin.from("card_transactions").upsert(
        unique.map((row) => ({
          external_id: row.id,
          occurred_at: new Date(row.occurredAt).toISOString(),
          amount: Math.abs(row.amount),
          currency_code: row.currency,
          merchant: row.merchant,
          status: row.status,
          source: "bybit-card",
          card_last4: row.last4 || null,
          raw: row,
        })),
        { onConflict: "source,external_id", ignoreDuplicates: false },
      );
      if (saveError) console.error("Bybit card transaction save failed", saveError.message);
      return { configured: true as const, source: cardPath, rows: unique, balance, errors: [] };
    }


    console.warn("Bybit card transaction endpoints unavailable", probeErrors);
    return {
      configured: true as const,
      source: cardPath,
      rows: [],
      balance,
      errors: probeErrors.filter((message) => !/rate limit|too many visits|param_illegal/i.test(message)).slice(0, 1),
    };

  });

/**
 * Pay Rewards (Bybit Card cashback) — read the tier/rate straight from the
 * platform. Bybit exposes this under a few different card reward paths
 * depending on account region, so we probe them and return the first hit.
 */
export const getBybitCardRewards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "employee")) {
      throw new Error("Forbidden: staff only");
    }

    const apiKey = process.env["BYBIT_API_KEY"];
    const apiSecret = process.env["BYBIT_API_SECRET"];
    if (!apiKey || !apiSecret) {
      return { configured: false as const, rate: null, tier: null, monthlySpend: null, maxCashback: null, errors: ["missing keys"] };
    }

    const { createHmac } = await import("node:crypto");
    const recv = "20000";

    async function call(path: string, method: "GET" | "POST") {
      const ts = Date.now().toString();
      const payload = method === "POST" ? "{}" : "";
      const sign = createHmac("sha256", apiSecret!).update(ts + apiKey! + recv + payload).digest("hex");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(`https://api.bybit.com${path}`, {
          method,
          headers: {
            Accept: "application/json",
            ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
            "X-BAPI-API-KEY": apiKey!,
            "X-BAPI-TIMESTAMP": ts,
            "X-BAPI-RECV-WINDOW": recv,
            "X-BAPI-SIGN": sign,
          },
          ...(method === "POST" ? { body: payload } : {}),
          signal: controller.signal,
        });
        const text = await res.text();
        if (!text.trim()) throw new Error(`${path} empty response`);
        const body = JSON.parse(text) as { retCode?: number; retMsg?: string; result?: Record<string, any> };
        if (!res.ok || body.retCode !== 0) throw new Error(`${path} ${body.retMsg ?? "failed"}`);
        return body.result ?? {};
      } finally {
        clearTimeout(timeout);
      }
    }

    const candidates: [string, "GET" | "POST"][] = [
      ["/v5/card/reward/query-cashback-info", "POST"],
      ["/v5/card/reward/query-cashback-info", "GET"],
      ["/v5/card/rewards/query-info", "POST"],
      ["/v5/card/reward/info", "GET"],
      ["/v5/card/reward/query-user-tier", "POST"],
      ["/v5/card/query-card-info", "GET"],
    ];


    const errors: string[] = [];
    for (const [path, method] of candidates) {
      try {
        const r: any = await call(path, method);
        const node = r?.data ?? r ?? {};
        const rateRaw = node.cashbackRate ?? node.rate ?? node.currentRate;
        const rate = rateRaw == null ? null : Number(rateRaw) <= 1 ? Number(rateRaw) * 100 : Number(rateRaw);
        const monthlySpend = node.monthlySpend ?? node.spendAmount ?? node.currentSpend;
        return {
          configured: true as const,
          rate: Number.isFinite(rate as number) ? (rate as number) : null,
          tier: node.level ?? node.tier ?? node.tierName ?? null,
          monthlySpend: monthlySpend == null ? null : Number(monthlySpend),
          maxCashback: node.maxCashback == null ? null : Number(node.maxCashback),
          errors: [],
        };
      } catch (error) {
        errors.push(String((error as Error).message));
      }
    }

    return { configured: true as const, rate: null, tier: null, monthlySpend: null, maxCashback: null, errors: errors.slice(0, 1) };
  });
