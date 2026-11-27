import { getRequest } from "@tanstack/react-start/server";

/** Durable server-side throttle. Trust only Fly's proxy-injected client address. */
export async function enforcePublicOrderRateLimit(action: string, limit: number, windowSeconds: number): Promise<void> {
  const request = getRequest();
  const clientIp = request?.headers?.get("fly-client-ip")?.trim();
  // Never fall back to x-forwarded-for: callers can forge it when the origin is reachable.
  if (!clientIp || clientIp.length > 100 || /[\\s,]/.test(clientIp)) {
    throw new Error("تعذر التحقق من مصدر الطلب. حاول مرة أخرى لاحقًا.");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("consume_public_rate_limit", {
    p_bucket: `public-order:${action}:${clientIp}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error || typeof data !== "boolean") {
    console.error("Public order rate limit unavailable:", error?.code ?? "invalid_result");
    throw new Error("خدمة الطلبات غير متاحة مؤقتًا. حاول مرة أخرى.");
  }
  if (!data) throw new Error("تم تجاوز عدد المحاولات المسموح. حاول مرة أخرى بعد قليل.");
}
