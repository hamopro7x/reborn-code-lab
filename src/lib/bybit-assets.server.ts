/**
 * Read-only provider queries for Bybit P2P, on-chain, and internal transfers.
 * The caller supplies account-scoped credentials; no ledger writes happen here.
 */
import { call, getCreds } from "./bybit-account.server";
import { currentBybitRows } from "./monthly-cycle.server";
import { num } from "./bybit-runtime";

export type AssetRow = {
  id: string;
  coin: string;
  chain: string;
  amount: number;
  fee: number;
  status: string;
  time: number;
  address: string;
  direction: "in" | "out";
};

export type P2PRow = {
  id: string;
  side: "buy" | "sell";
  coin: string;
  fiat: string;
  amount: number;
  quantity: number;
  price: number;
  status: string;
  counterparty: string;
  time: number;
};

const p2pStatus = (s: unknown) => {
  const v = Number(s ?? 0);
  if (v === 50) return "اكتملت";
  if (v === 40 || v === 80) return "ملغاة";
  if (v === 70) return "فشل الدفع";
  if (v === 30 || v === 100) return "قيد الاعتراض";
  if (v === 10) return "بانتظار الدفع";
  if (v === 20) return "بانتظار التحرير";
  if (v === 60) return "جارٍ الدفع";
  return "قيد التنفيذ";
};

export async function fetchP2P(accountId?: string): Promise<P2PRow[]> {
  const creds = await getCreds(accountId);
  const out: P2PRow[] = [];
  let expectedCount: number | null = null;
  const maxPages = 100; // fail closed rather than silently truncating an unexpectedly large history
  for (let page = 1; page <= maxPages; page++) {
    const result: any = await call("POST", "/v5/p2p/order/simplifyList", { page, size: 30 }, creds);
    const items: any[] = result?.items ?? result?.result ?? [];
    if (!Array.isArray(items)) throw new Error("Bybit P2P returned an invalid page");
    if (expectedCount === null && Number.isFinite(Number(result?.count))) expectedCount = Number(result.count);
    if (items.length === 0) break;
    for (const it of items) {
      out.push({
        id: String(it.id ?? it.orderId ?? ""),
        side: Number(it.side) === 1 ? "sell" : "buy",
        coin: String(it.tokenId ?? it.coin ?? ""),
        fiat: String(it.currencyId ?? it.fiat ?? ""),
        amount: num(it.amount),
        quantity: num(it.quantity ?? it.notifyTokenQuantity),
        price: num(it.price),
        status: p2pStatus(it.status),
        counterparty: String(it.targetNickName ?? it.targetUserId ?? ""),
        time: Number(it.createDate ?? it.createTime ?? 0),
      });
    }
    if (items.length < 30 || (expectedCount !== null && page * 30 >= expectedCount)) break;
    if (page === maxPages) throw new Error("Bybit P2P history exceeded the safe pagination limit; retry with a narrower date range");
  }
  if (expectedCount !== null && out.length < expectedCount) {
    throw new Error(`Bybit P2P history incomplete: received ${out.length} of ${expectedCount} records`);
  }
  return currentBybitRows(out).sort((a, b) => b.time - a.time);
}

const wdStatus = (s: unknown) => {
  const v = String(s ?? "").trim().toLowerCase();
  if (v === "success" || v === "3" || v === "completed") return "ناجحة";
  return "فاشلة";
};

export async function fetchOnChain(accountId?: string): Promise<{ deposits: AssetRow[]; withdrawals: AssetRow[] }> {
  const creds = await getCreds(accountId);
  const [dep, wd] = await Promise.all([
    call("GET", "/v5/asset/deposit/query-record", { limit: 50 }, creds),
    call("GET", "/v5/asset/withdraw/query-record", { limit: 50, withdrawType: 0 }, creds),
  ]);

  const deposits: AssetRow[] = (dep?.rows ?? []).map((d: any) => ({
          id: String(d.txID ?? d.txId ?? d.successAt),
          coin: String(d.coin ?? ""),
          chain: String(d.chain ?? ""),
          amount: num(d.amount),
          fee: num(d.depositFee),
          status: String(d.status) === "3" ? "ناجحة" : "فاشلة",
          time: Number(d.successAt ?? 0),
          address: String(d.toAddress ?? ""),
          direction: "in" as const,
        }));

  const withdrawals: AssetRow[] = (wd?.rows ?? []).map((w: any) => ({
          id: String(w.withdrawId ?? w.txID),
          coin: String(w.coin ?? ""),
          chain: String(w.chain ?? ""),
          amount: -num(w.amount),
          fee: num(w.withdrawFee),
          status: wdStatus(w.status),
          time: Number(w.createTime ?? 0),
          address: String(w.toAddress ?? ""),
          direction: "out" as const,
        }));

  return { deposits: currentBybitRows(deposits), withdrawals: currentBybitRows(withdrawals) };
}

export async function fetchInternal(accountId?: string): Promise<{ deposits: AssetRow[]; withdrawals: AssetRow[] }> {
  const creds = await getCreds(accountId);
  const [dep, wd] = await Promise.all([
    call("GET", "/v5/asset/deposit/query-internal-record", { limit: 50 }, creds),
    call("GET", "/v5/asset/withdraw/query-record", { limit: 50, withdrawType: 1 }, creds),
  ]);

  const deposits: AssetRow[] = (dep?.rows ?? []).map((d: any) => ({
          id: String(d.id ?? d.txID),
          coin: String(d.coin ?? ""),
          chain: "التحويل الداخلي",
          amount: num(d.amount),
          fee: 0,
          status: String(d.status) === "2" ? "ناجحة" : "فاشلة",
          time: Number(d.createdTime ?? 0),
          address: String(d.address ?? d.fromAddress ?? ""),
          direction: "in" as const,
        }));

  const withdrawals: AssetRow[] = (wd?.rows ?? []).map((w: any) => ({
          id: String(w.withdrawId ?? w.txID),
          coin: String(w.coin ?? ""),
          chain: "التحويل الداخلي",
          amount: -num(w.amount),
          fee: num(w.withdrawFee),
          status: wdStatus(w.status),
          time: Number(w.createTime ?? 0),
          address: String(w.toAddress ?? ""),
          direction: "out" as const,
        }));

  return { deposits: currentBybitRows(deposits), withdrawals: currentBybitRows(withdrawals) };
}
