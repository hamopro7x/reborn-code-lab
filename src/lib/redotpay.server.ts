import { createHmac } from "crypto";

/** RedotPay open API base (override with REDOTPAY_API_BASE if the account uses another host). */
const DEFAULT_BASE = "https://open-api.redotpay.com";

type Creds = { key: string; secret: string };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function getCreds(): Promise<Creds | null> {
  try {
    const db = await admin();
    const { data } = await db.rpc("integration_get_redotpay");
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.api_key && row?.api_secret) return { key: row.api_key, secret: row.api_secret };
  } catch {
    /* ignore */
  }
  return null;
}

export async function setCreds(key: string, secret: string, userId: string) {
  const db = await admin();
  const { error } = await db.rpc("integration_set_redotpay", { p_key: key, p_secret: secret, p_by: userId });
  if (error) throw new Error(error.message);
  return true;
}

export async function clearCreds() {
  const db = await admin();
  await db.rpc("integration_clear_redotpay");
  return true;
}

export async function serverIp(): Promise<string | null> {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const j: any = await res.json();
    return j?.ip ? String(j.ip) : null;
  } catch {
    return null;
  }
}

function sign(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Signed request against the RedotPay open API. */
export async function call(
  method: "GET" | "POST",
  path: string,
  params: Record<string, any> = {},
  creds?: Creds,
): Promise<any> {
  const c = creds ?? (await getCreds());
  if (!c) throw new Error("لم يتم ربط مفاتيح RedotPay بعد");

  const base = process.env["REDOTPAY_API_BASE"] || DEFAULT_BASE;
  const ts = Date.now().toString();
  const query = method === "GET" ? new URLSearchParams(params as any).toString() : "";
  const body = method === "POST" ? JSON.stringify(params ?? {}) : "";
  const signature = sign(c.secret, `${ts}${c.key}${method}${path}${query}${body}`);

  const url = `${base}${path}${query ? `?${query}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": c.key,
      "X-Timestamp": ts,
      "X-Signature": signature,
    },
    ...(method === "POST" ? { body } : {}),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non json */
  }
  if (!res.ok) {
    const msg = json?.message || json?.msg || json?.error || text?.slice(0, 200) || `HTTP ${res.status}`;
    throw new Error(`RedotPay: ${msg}`);
  }
  if (json && typeof json.code !== "undefined" && Number(json.code) !== 0) {
    throw new Error(`RedotPay ${json.code}: ${json.message ?? json.msg ?? "طلب مرفوض"}`);
  }
  return json?.data ?? json;
}

/** Verifies the credentials by asking RedotPay for the account balance. */
export async function testCreds(creds: Creds) {
  return call("GET", "/v1/account/balance", {}, creds);
}

export async function fetchBalance() {
  return call("GET", "/v1/account/balance", {});
}
