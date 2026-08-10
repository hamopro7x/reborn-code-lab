import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * تفاصيل معاملة الفيزا من باي بت.
 * قائمة المعاملات (query-asset-records) بترجّع الحقول الأساسية فقط، والنقاط
 * ومبلغ/تاريخ التسوية وبيانات التاجر بتيجي من نداء التفاصيل المنفصل.
 * بنجرّب المسارات المعروفة لحد ما واحد ينجح، وبنرجّع كل الحقول اللي رجعت.
 */
export const getBybitCardTransactionDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        txnId: z.string().min(1),
        paymentId: z.string().optional().default(""),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
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
      return { found: false as const, fields: [] as { key: string; value: string }[], detail: {} as Record<string, string> };
    }

    const { createHmac } = await import("node:crypto");
    const recv = "20000";

    async function post(path: string, params: Record<string, string | number>) {
      const payload = JSON.stringify(params);
      const ts = Date.now().toString();
      const sign = createHmac("sha256", apiSecret!).update(ts + apiKey! + recv + payload).digest("hex");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      try {
        const res = await fetch(`https://api.bybit.com${path}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-BAPI-API-KEY": apiKey!,
            "X-BAPI-TIMESTAMP": ts,
            "X-BAPI-RECV-WINDOW": recv,
            "X-BAPI-SIGN": sign,
          },
          body: payload,
          signal: controller.signal,
        });
        const text = await res.text();
        const body = text.trim() ? (JSON.parse(text) as { retCode?: number; retMsg?: string; result?: unknown }) : {};
        if (!res.ok || body.retCode !== 0) {
          throw new Error(`${path} ${body.retMsg ?? res.status}`);
        }
        return body.result ?? {};
      } finally {
        clearTimeout(timer);
      }
    }

    // أول كائن فيه حقول فعلية داخل الردّ (الردّ ساعات بيكون متداخل)
    const pickRecord = (value: unknown, depth = 0): Record<string, unknown> | null => {
      if (depth > 4 || !value || typeof value !== "object") return null;
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = pickRecord(item, depth + 1);
          if (found) return found;
        }
        return null;
      }
      const node = value as Record<string, unknown>;
      const scalarKeys = Object.keys(node).filter((k) => {
        const v = node[k];
        return v !== null && typeof v !== "object";
      });
      if (scalarKeys.length >= 3) return node;
      for (const k of Object.keys(node)) {
        const found = pickRecord(node[k], depth + 1);
        if (found) return found;
      }
      return null;
    };

    const attempts: { path: string; params: Record<string, string | number> }[] = [
      { path: "/v5/card/transaction/query-asset-detail", params: { txnId: data.txnId } },
      { path: "/v5/card/transaction/query-detail", params: { txnId: data.txnId } },
      { path: "/v5/card/transaction/detail", params: { txnId: data.txnId } },
      { path: "/v5/card/transaction/query-asset-records", params: { txnId: data.txnId, page: 1, limit: 1 } },
    ];
    if (data.paymentId) {
      attempts.push(
        { path: "/v5/card/transaction/query-asset-detail", params: { paymentId: data.paymentId } },
        { path: "/v5/card/transaction/query-detail", params: { paymentId: data.paymentId } },
      );
    }

    let record: Record<string, unknown> | null = null;
    for (const attempt of attempts) {
      try {
        const result = await post(attempt.path, attempt.params);
        const found = pickRecord(result);
        if (found) {
          record = found;
          break;
        }
      } catch {
        // نجرّب المسار التالي
      }
    }

    if (!record) {
      return { found: false as const, fields: [] as { key: string; value: string }[], detail: {} as Record<string, string> };
    }

    const detail: Record<string, string> = {};
    const fields: { key: string; value: string }[] = [];
    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === undefined || typeof value === "object") continue;
      const str = String(value).trim();
      if (!str) continue;
      detail[key] = str;
      fields.push({ key, value: str });
    }

    return { found: true as const, fields, detail };
  });
