import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BybitCard = {
  id: string;
  last4: string;
  pan: string;
  brand: string;
  kind: string;
  status: string;
  currency: string;
  expiry: string;
  holder: string;
  fields: { key: string; value: string }[];
};

/**
 * قائمة بطاقات باي بت الكاملة (زي صفحة إدارة البطاقات في باي بت).
 * بنجرّب مسارات البطاقات المعروفة لحد ما واحد يرجّع قائمة.
 */
export const getBybitCards = createServerFn({ method: "POST" })
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
      return { configured: false as const, cards: [] as BybitCard[], error: "missing keys" };
    }

    const { createHmac } = await import("node:crypto");
    const recv = "20000";

    async function call(path: string, method: "POST" | "GET") {
      const ts = Date.now().toString();
      const payload = method === "POST" ? "{}" : "";
      const sign = createHmac("sha256", apiSecret!).update(ts + apiKey! + recv + payload).digest("hex");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
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
        const body = text.trim()
          ? (JSON.parse(text) as { retCode?: number; retMsg?: string; result?: unknown })
          : {};
        if (!res.ok || body.retCode !== 0) throw new Error(String(body.retMsg ?? res.status));
        return body.result ?? {};
      } finally {
        clearTimeout(timer);
      }
    }

    const listFrom = (value: unknown): Record<string, unknown>[] => {
      if (Array.isArray(value)) return value as Record<string, unknown>[];
      if (!value || typeof value !== "object") return [];
      const node = value as Record<string, unknown>;
      for (const key of ["list", "rows", "cards", "data", "cardList", "cardInfoList"]) {
        const found = listFrom(node[key]);
        if (found.length > 0) return found;
      }
      return [];
    };

    const paths: [string, "POST" | "GET"][] = [
      ["/v5/card/query-card-list", "POST"],
      ["/v5/card/query-card-list", "GET"],
      ["/v5/card/query-card-info", "POST"],
      ["/v5/card/query-card-info", "GET"],
    ];

    let raw: Record<string, unknown>[] = [];
    let error = "";
    for (const [path, method] of paths) {
      try {
        const result = await call(path, method);
        const list = listFrom(result);
        if (list.length > 0) {
          raw = list;
          break;
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }

    // بعض حسابات Bybit لا تتيح مسار قائمة البطاقات لمفاتيح API، بينما
    // تعيد بيانات البطاقة داخل سجل معاملاتها. استخرج بطاقة فريدة لكل PAN
    // حتى تظل شاشة إدارة البطاقة عاملة بنفس بيانات الحساب الفعلية.
    if (raw.length === 0) {
      const transactionCards: Record<string, unknown>[] = [];
      for (const type of ["SIDE_QUERY_AUTH", "SIDE_QUERY_FINANCIAL", "SIDE_QUERY_REFUND"]) {
        try {
          const result = await (async () => {
            const ts = Date.now().toString();
            const payload = JSON.stringify({ type, page: 1, limit: 100 });
            const sign = createHmac("sha256", apiSecret)
              .update(ts + apiKey + recv + payload)
              .digest("hex");
            const response = await fetch("https://api.bybit.com/v5/card/transaction/query-asset-records", {
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
            });
            const body = (await response.json()) as {
              retCode?: number;
              retMsg?: string;
              result?: unknown;
            };
            if (!response.ok || body.retCode !== 0) {
              throw new Error(String(body.retMsg ?? response.status));
            }
            return body.result ?? {};
          })();
          transactionCards.push(...listFrom(result));
        } catch (e) {
          error ||= e instanceof Error ? e.message : String(e);
        }
      }

      const unique = new Map<string, Record<string, unknown>>();
      for (const row of transactionCards) {
        const panValue = String(
          row["maskPan"] ?? row["maskedPan"] ?? row["cardNo"] ?? row["pan4"] ?? row["last4"] ?? "",
        );
        const last4 = panValue.replace(/\D/g, "").slice(-4);
        if (!last4) continue;
        const previous = unique.get(last4) ?? {};
        unique.set(last4, { ...previous, ...row, pan4: last4 });
      }
      raw = [...unique.values()];
    }

    const str = (v: unknown) => String(v ?? "").trim();
    const brandOf = (c: Record<string, unknown>) => {
      const v = str(c["cardBrand"] ?? c["brand"] ?? c["cardOrg"] ?? c["cardScheme"] ?? c["cardNetwork"] ?? "").toLowerCase();
      if (/master|mc\b/.test(v)) return "mastercard";
      if (v.includes("visa")) return "visa";
      const bin = str(c["cardBin"] ?? c["bin"] ?? c["pan6"] ?? "");
      if (/^5|^2/.test(bin)) return "mastercard";
      if (/^4/.test(bin)) return "visa";
      return "";
    };
    const kindOf = (c: Record<string, unknown>) => {
      const v = str(c["cardType"] ?? c["cardCategory"] ?? c["cardKind"] ?? "").toLowerCase();
      if (v.includes("virt") || v === "1") return "virtual";
      if (v.includes("phys") || v === "2") return "physical";
      return "";
    };

    const cards: BybitCard[] = raw.map((c, i) => {
      const fields: { key: string; value: string }[] = [];
      for (const [key, value] of Object.entries(c)) {
        if (value === null || value === undefined || typeof value === "object") continue;
        const v = str(value);
        if (v) fields.push({ key, value: v });
      }
      const rawPan = str(
        c["maskPan"] ?? c["maskedPan"] ?? c["cardNoMask"] ?? c["panMask"] ?? c["cardNo"] ?? "",
      );
      const last4 = str(c["pan4"] ?? c["last4"] ?? c["cardLast4"] ?? rawPan)
        .replace(/\D/g, "")
        .slice(-4);
      const bin = str(c["cardBin"] ?? c["bin"] ?? c["pan6"] ?? "").replace(/\D/g, "");
      const pan = rawPan.replace(/\D/g, "").length >= 12
        ? rawPan
        : bin || last4
          ? `${(bin.slice(0, 4) || "****").padEnd(4, "*")} ${(bin.slice(4, 6) || "**").padEnd(4, "*")} **** ${last4 || "****"}`
          : "";
      return {
        id: str(c["cardId"] ?? c["id"] ?? c["cardNo"] ?? i),
        last4,
        pan,

        brand: brandOf(c),
        kind: kindOf(c),
        status: str(c["cardStatus"] ?? c["status"] ?? ""),
        currency: str(c["cardCurrency"] ?? c["basicCurrency"] ?? c["currency"] ?? c["settleCurrency"] ?? ""),
        expiry: str(c["expireDate"] ?? c["expiryDate"] ?? c["expDate"] ?? c["validThru"] ?? ""),
        holder: str(c["cardHolder"] ?? c["holderName"] ?? c["ownerName"] ?? c["name"] ?? ""),
        fields,
      };
    });

    return { configured: true as const, cards, error: cards.length === 0 ? error : "" };
  });
