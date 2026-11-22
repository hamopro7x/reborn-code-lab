/**
 * Read-only provider queries for Bybit P2P, on-chain, and internal transfers.
 * The caller supplies account-scoped credentials; no ledger writes happen here.
 */
import { call } from "./bybit-client.server";
import { getCreds } from "./bybit-credentials.server";
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
  for (let page = 1; page <= 5; page++) {
    let result: any;
    try {
      result = await call("POST", "/v5/p2p/order/simplifyList", { page, size: 30 }, creds);
    } catch (e) {
      if (page === 1) throw e;
      break;
    }
    const items: any[] = result?.items ?? result?.result ?? [];
    if (!Array.isArray(items) || items.length === 0) break;
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
    if (items.length < 30) break;
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
  const [dep, wd] = await Promise.allSettled([
    call("GET", "/v5/asset/deposit/query-record", { limit: 50 }, creds),
    call("GET", "/v5/asset/withdraw/query-record", { limit: 50, withdrawType: 0 }, creds),
  ]);

  const deposits: AssetRow[] =
    dep.status === "fulfilled"
      ? (dep.value?.rows ?? []).map((d: any) => ({
          id: String(d.txID ?? d.txId ?? d.successAt),
          coin: String(d.coin ?? ""),
          chain: String(d.chain ?? ""),
          amount: num(d.amount),
          fee: num(d.depositFee),
          status: String(d.status) === "3" ? "ناجحة" : "فاشلة",
          time: Number(d.successAt ?? 0),
          address: String(d.toAddress ?? ""),
          direction: "in" as const,
        }))
      : [];

  const withdrawals: AssetRow[] =
    wd.status === "fulfilled"
      ? (wd.value?.rows ?? []).map((w: any) => ({
          id: String(w.withdrawId ?? w.txID),
          coin: String(w.coin ?? ""),
          chain: String(w.chain ?? ""),
          amount: -num(w.amount),
          fee: num(w.withdrawFee),
          status: wdStatus(w.status),
          time: Number(w.createTime ?? 0),
          address: String(w.toAddress ?? ""),
          direction: "out" as const,
        }))
      : [];

  return { deposits: currentBybitRows(deposits), withdrawals: currentBybitRows(withdrawals) };
}

export async function fetchInternal(accountId?: string): Promise<{ deposits: AssetRow[]; withdrawals: AssetRow[] }> {
  const creds = await getCreds(accountId);
  const [dep, wd] = await Promise.allSettled([
    call("GET", "/v5/asset/deposit/query-internal-record", { limit: 50 }, creds),
    call("GET", "/v5/asset/withdraw/query-record", { limit: 50, withdrawType: 1 }, creds),
  ]);

  const deposits: AssetRow[] =
    dep.status === "fulfilled"
      ? (dep.value?.rows ?? []).map((d: any) => ({
          id: String(d.id ?? d.txID),
          coin: String(d.coin ?? ""),
          chain: "التحويل الداخلي",
          amount: num(d.amount),
          fee: 0,
          status: String(d.status) === "2" ? "ناجحة" : "فاشلة",
          time: Number(d.createdTime ?? 0),
          address: String(d.address ?? d.fromAddress ?? ""),
          direction: "in" as const,
        }))
      : [];

  const withdrawals: AssetRow[] =
    wd.status === "fulfilled"
      ? (wd.value?.rows ?? []).map((w: any) => ({
          id: String(w.withdrawId ?? w.txID),
          coin: String(w.coin ?? ""),
          chain: "التحويل الداخلي",
          amount: -num(w.amount),
          fee: num(w.withdrawFee),
          status: wdStatus(w.status),
          time: Number(w.createTime ?? 0),
          address: String(w.toAddress ?? ""),
          direction: "out" as const,
        }))
      : [];

  return { deposits: currentBybitRows(deposits), withdrawals: currentBybitRows(withdrawals) };
}
