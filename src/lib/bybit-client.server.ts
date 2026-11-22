// Signed Bybit REST transport and API-key validation.
import { createHmac } from "crypto";
import { normalizeBybitError, type BybitError } from "./bybit-errors";
import { getCreds, type Creds } from "./bybit-credentials.server";
import { BYBIT_BASE_URL as BASE, BYBIT_RECV_WINDOW as RECV, sleep } from "./bybit-runtime";

/** Validates a key/secret pair on its own — never touches stored accounts. */
export async function testCreds(c: Creds) {
  // Different keys have different scopes; accept the key if ANY read endpoint works.
  const attempts: Array<() => Promise<unknown>> = [
    () => call("GET", "/v5/account/wallet-balance", { accountType: "UNIFIED" }, c),
    () => call("GET", "/v5/asset/transfer/query-account-coins-balance", { accountType: "FUND" }, c),
    () => call("GET", "/v5/asset/deposit/query-record", { limit: 1 }, c),
    () => call("GET", "/v5/user/query-api", {}, c),
  ];
  const errors: unknown[] = [];
  for (const run of attempts) {
    try {
      await run();
      return true;
    } catch (e) {
      errors.push(e);
    }
  }
  // Report the most actionable failure using the shared error rules.
  const normalized: BybitError[] = errors.map((e) => normalizeBybitError(e));
  const priority: Array<BybitError["code"]> = ["NO_PERMISSION", "IP_RESTRICTED", "BAD_KEY", "RATE_LIMITED", "NETWORK"];
  const pick = priority.map((c2) => normalized.find((n) => n.code === c2)).find(Boolean) ?? normalized[0];
  throw new Error(pick?.message ?? "تعذّر التحقق من المفتاح");
}


export async function call(method: "GET" | "POST", path: string, params: Record<string, unknown> = {}, override?: Creds) {
  const { key, secret } = override ?? (await getCreds());
  let url = `${BASE}${path}`;
  let payload = "";
  let body: string | undefined;

  if (method === "GET") {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    payload = qs;
    if (qs) url += `?${qs}`;
  } else {
    body = JSON.stringify(params);
    payload = body;
  }

  // Bybit occasionally rate-limits or drops a connection. A single 6s attempt
  // made whole accounts render as "failed"; retry transient failures instead.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ts = Date.now().toString();
    const sign = createHmac("sha256", secret).update(ts + key + RECV + payload).digest("hex");
    try {
      const res = await fetch(url, {
        method,
        signal: AbortSignal.timeout(15_000),
        headers: {
          "X-BAPI-API-KEY": key,
          "X-BAPI-TIMESTAMP": ts,
          "X-BAPI-RECV-WINDOW": RECV,
          "X-BAPI-SIGN": sign,
          "X-BAPI-SIGN-TYPE": "2",
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body } : {}),
      });

      const text = await res.text();
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Bybit HTTP ${res.status}`);
        await sleep(700 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`Bybit HTTP ${res.status}: ${text.slice(0, 400)}`);
      const json = JSON.parse(text) as {
        retCode?: number;
        retMsg?: string;
        ret_code?: number;
        ret_msg?: string;
        result: any;
      };
      const retCode = json.retCode ?? json.ret_code;
      const retMsg = json.retMsg ?? json.ret_msg ?? "Unknown error";
      if (retCode === 10006 || retCode === 10016) {
        lastErr = new Error(`Bybit ${retCode}: ${retMsg}`);
        await sleep(900 * (attempt + 1));
        continue;
      }
      if (retCode !== 0) throw new Error(`Bybit ${retCode ?? "UNKNOWN"}: ${retMsg}`);
      return json.result ?? {};
    } catch (e: any) {
      const msg = String(e?.name ?? "") + String(e?.message ?? e);
      const transient = /Abort|timeout|timed out|fetch failed|ECONNRESET|network/i.test(msg);
      if (!transient) throw e;
      lastErr = e;
      await sleep(700 * (attempt + 1));
    }
  }
  throw new Error(String((lastErr as any)?.message ?? lastErr ?? "Bybit request failed"));
}
