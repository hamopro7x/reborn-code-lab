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
    const path = "/v5/card/transaction/query-asset-records";

    async function post(params: Record<string, string | number>) {
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
        const body = text.trim()
          ? (JSON.parse(text) as { retCode?: number; retMsg?: string; result?: { data?: unknown[] } })
          : {};
        if (!res.ok || body.retCode !== 0) throw new Error(String(body.retMsg ?? res.status));
        return (body.result?.data ?? []) as Record<string, unknown>[];
      } finally {
        clearTimeout(timer);
      }
    }

    // نفس نداء السجلات هو نداء التفاصيل: txnId (أو orderNo) بحث مطابق تام
    // ويرجّع كل حقول المعاملة (الرسوم، سعر التحويل، المبلغ المدفوع، MCC...).
    const attempts: Record<string, string | number>[] = [
      { txnId: data.txnId },
      { txnId: data.txnId, type: "SIDE_QUERY_AUTH" },
    ];
    if (data.paymentId) attempts.push({ orderNo: data.paymentId });

    let record: Record<string, unknown> | null = null;
    for (const params of attempts) {
      try {
        const rows = await post(params);
        if (rows.length > 0 && rows[0]) {
          record = rows[0];
          break;
        }
      } catch {
        // نجرّب الصيغة التالية
      }
    }

    if (!record) {
      return { found: false as const, fields: [] as { key: string; value: string }[], detail: {} as Record<string, string> };
    }

    // تنظيف الأرقام الطويلة (باي بت بيرجّع 18 خانة عشرية أو صيغة 0E-18)
    const clean = (value: unknown): string => {
      const str = String(value).trim();
      if (!str) return "";
      if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(str)) {
        const n = Number(str);
        if (Number.isFinite(n)) return n === 0 ? "0" : String(Number(n.toFixed(8)));
      }
      return str;
    };

    const detail: Record<string, string> = {};
    const fields: { key: string; value: string }[] = [];
    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === undefined || typeof value === "object") continue;
      const str = clean(value);
      if (!str) continue;
      detail[key] = str;
      fields.push({ key, value: str });
    }

    return { found: true as const, fields, detail };
  });

