import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";
import { getBybitCardBrands, getBybitLedger, getBybitSpendTotals } from "@/lib/bybit.functions";
import { formatDateTime } from "@/lib/format";
import usdtOfficial from "@/assets/usdt-official.png.asset.json";

/** Same stat tile as the source visa account cards. */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-black">{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}


/** Coin cell with the official token icon, matching the source account layout. */
function CoinCell({ coin }: { coin: string }) {
  const c = String(coin || "").toUpperCase();
  return (
    <span className="inline-flex items-center gap-2">
      {c === "USDT" ? (
        <img src={usdtOfficial.url} alt="USDT" className="size-5 shrink-0 rounded-full" loading="lazy" />
      ) : (
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-black">
          {c.slice(0, 2)}
        </span>
      )}
      <span className="font-bold">{c || "—"}</span>
    </span>
  );
}

/** Official network logos (same marks Bybit uses), keyed by chain name fragment. */
const CHAIN_LOGO_BASE = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains";
const CHAIN_LOGOS: [string, string][] = [
  ["BSC", "smartchain"],
  ["BNB", "smartchain"],
  ["BEP20", "smartchain"],
  ["APTOS", "aptos"],
  ["APT", "aptos"],
  ["TON", "ton"],
  ["ERC20", "ethereum"],
  ["ETH", "ethereum"],
  ["TRC20", "tron"],
  ["TRX", "tron"],
  ["TRON", "tron"],
  ["SOL", "solana"],
  ["POLYGON", "polygon"],
  ["MATIC", "polygon"],
  ["ARB", "arbitrum"],
  ["OP", "optimism"],
];

function ChainCell({ chain }: { chain: string }) {
  const raw = String(chain || "").trim();
  const [failed, setFailed] = useState(false);
  if (!raw) return <span className="text-muted-foreground">—</span>;
  const key = raw.toUpperCase();
  const slug = CHAIN_LOGOS.find(([k]) => key.includes(k))?.[1];
  return (
    <span className="inline-flex items-center gap-2">
      {slug && !failed ? (
        <img
          src={`${CHAIN_LOGO_BASE}/${slug}/info/logo.png`}
          alt={key}
          className="size-6 shrink-0 rounded-full"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-black">
          {key.slice(0, 2)}
        </span>
      )}
      <span className="text-xs font-bold text-blue-400">{key}</span>
    </span>
  );
}

const GROUPS: { key: string; label: string }[] = [
  { key: "txns", label: "المعاملات" },
  { key: "onchain", label: "السحب والإيداع الخارجي" },
  { key: "internal", label: "السحب والإيداع الداخلي" },
  { key: "p2p", label: "طلبات P2P" },
];

const SUB_FILTERS: Record<string, { key: string; label: string }[]> = {
  txns: [
    { key: "all", label: "الكل" },
    { key: "success", label: "المشتريات الناجحة" },
    { key: "failed", label: "المشتريات الفاشلة" },
    { key: "refund", label: "المبلغ المسترد" },
  ],
  onchain: [
    { key: "withdraw", label: "سحب" },
    { key: "deposit", label: "إيداع" },
  ],
  internal: [
    { key: "internal_out", label: "سحب" },
    { key: "internal_in", label: "إيداع" },
  ],
  p2p: [
    { key: "p2p_buy", label: "شراء" },
    { key: "p2p_sell", label: "بيع" },
  ],
};

/** أعمدة كل قسم كما يعرضها الحساب الأصلي في موقع الفيزا. */
const COLUMNS: Record<string, string[]> = {
  txns: [
    "اسم التاجر",
    "إجمالي المبلغ المصحح",
    "النوع",
    "الحالة",
    "تاريخ ووقت المعاملة",
    "آخر 4 أرقام للبطاقة",
    "الإجراء",
  ],
  onchain: ["عملة", "نوع السلسلة", "الكمية", "الرسوم", "التاريخ والوقت", "الحالة", "الإجراء"],
  internal: ["عملة", "الكمية", "العنوان", "الحالة", "التاريخ والوقت", "الإجراء"],
  p2p: ["النوع / التاريخ", "رقم الطلب", "السعر", "المبلغ / الكمية", "الطرف المقابل", "الحالة", "الإجراء"],
};


const KIND_LABEL: Record<string, string> = {
  card: "شراء",
  "1": "شراء",
  refund: "استرداد",
  deposit: "إيداع خارجي",
  withdraw: "سحب خارجي",
  internal_in: "إيداع داخلي",
  internal_out: "تحويل داخلي",
  p2p_buy: "شراء P2P",
  p2p_sell: "بيع P2P",
};


function Chip({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-xs font-bold transition-colors border ${
        active
          ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
          : "text-muted-foreground border-border/40 hover:text-foreground hover:border-blue-500/30"
      }`}
    >
      {children}
    </button>
  );
}

function MerchantLogo({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  const clean = String(name ?? "").trim().toLowerCase();
  const first = clean.split(/[\s*_\-.,·/]+/)[0] ?? "";
  const domain = /^[a-z0-9]{2,}$/.test(first) ? `${first}.com` : null;
  const letter = String(name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="size-7 shrink-0 rounded-full bg-muted grid place-items-center overflow-hidden text-[10px] font-black">
      {domain && !failed ? (
        <img
          src={`https://www.google.com/s2/favicons?sz=64&domain=${domain}`}
          alt={`شعار ${name}`}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        letter
      )}
    </span>
  );
}

/** Card brand mark. The brand itself always comes from the card record of the
 * main account (or the original transaction detail) — never chosen by hand. */
export function BrandBadge({ brand }: { brand: string }) {
  const b = String(brand ?? "").toLowerCase().replace(/\s+/g, "");
  if (b.includes("master")) {
    // Official Mastercard mark: red + yellow interlocking circles with the
    // darker orange intersection band.
    return (
      <span className="inline-flex items-center rounded-md bg-white px-1.5 py-1">
        <svg viewBox="0 0 152 94" className="h-3.5 w-auto" role="img" aria-label="Mastercard">
          <circle cx="47" cy="47" r="47" fill="#eb001b" />
          <circle cx="105" cy="47" r="47" fill="#f79e1b" />
          <path
            fill="#ff5f00"
            d="M76 8.6a47 47 0 000 76.8 47 47 0 000-76.8z"
          />
        </svg>
      </span>
    );
  }

  const label =
    b.includes("visa") || !b
      ? "VISA"
      : b.includes("amex") || b.includes("express")
        ? "AMEX"
        : b.includes("union")
          ? "UNIONPAY"
          : b.includes("jcb")
            ? "JCB"
            : b.includes("discover")
              ? "DISCOVER"
              : b.includes("maestro")
                ? "MAESTRO"
                : b.includes("diners")
                  ? "DINERS"
                  : brand.toUpperCase();
  const bg =
    label === "VISA"
      ? "bg-[#1434cb]"
      : label === "AMEX"
        ? "bg-[#2e77bc]"
        : label === "UNIONPAY"
          ? "bg-[#005b9a]"
          : label === "DISCOVER"
            ? "bg-[#f76b1c]"
            : "bg-muted-foreground/70";
  return (
    <span className={`rounded-md ${bg} px-2 py-1 text-[8px] font-black italic tracking-wider text-white`}>
      {label}
    </span>
  );
}


const OK_STATUS = new Set([
  "success",
  "successful",
  "completed",
  "complete",
  "finished",
  "done",
  "filled",
  "ok",
  "2",
  "3",
  "ناجحة",
  "اكتملت",
  "مكتملة",
  "تمت",
  "منجزة",
]);
const BAD_STATUS = new Set([
  "failed",
  "fail",
  "failure",
  "cancelled",
  "canceled",
  "rejected",
  "expired",
  "ملغاة",
  "فاشلة",
  "مرفوضة",
  "منتهية",
]);

export function statusBadge(kind: string, status: string) {
  const s = String(status || "").trim().toLowerCase();
  if (kind === "refund" || s === "refund" || s === "مسترد") return { cls: "bg-muted text-muted-foreground", text: "مسترد" };
  if (OK_STATUS.has(s)) return { cls: "bg-emerald-500/15 text-emerald-400", text: "ناجحة" };
  if (BAD_STATUS.has(s)) return { cls: "bg-red-500/15 text-red-400", text: "فاشلة" };
  if (s === "pending" || s === "قيد التنفيذ" || s === "0" || s === "1")
    return { cls: "bg-amber-500/15 text-amber-400", text: "قيد التنفيذ" };
  return { cls: "bg-muted text-muted-foreground", text: status || "—" };
}



function amt(n: number) {
  return Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}

/** السجل المركزي: كل معاملة على أي حساب من حسابات الفيزا تُسجَّل هنا تلقائياً. */
export function BybitLedgerPanel() {
  const listFn = useServerFn(getBybitLedger);
  const [group, setGroup] = useState("txns");
  const [status, setStatus] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const q = useQuery({
    queryKey: ["bybit-ledger", group, status, page],
    queryFn: () => listFn({ data: { group, status, page, pageSize } }),
    placeholderData: (prev) => prev,
    staleTime: 20_000,
    // Poll only while the tab is actually visible; a hidden panel used to keep
    // hitting the server in the background.
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const rows = q.data?.rows ?? [];
  
  const total = Number(q.data?.total ?? 0);
  const pages = Math.max(Math.ceil(total / pageSize), 1);

  const totalsFn = useServerFn(getBybitSpendTotals);
  const totalsQ = useQuery({
    queryKey: ["bybit-spend-totals"],
    queryFn: () => totalsFn({ data: undefined as any }),
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
  const brandsFn = useServerFn(getBybitCardBrands);
  const brandsQ = useQuery({
    queryKey: ["bybit-card-brands"],
    queryFn: () => brandsFn({ data: undefined as any }),
    staleTime: 300_000,
  });
  const brands = (brandsQ.data?.brands ?? {}) as Record<string, string>;

  const t = totalsQ.data;
  const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;

  return (
    <div className="relative z-10 space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {GROUPS.map((g) => (
            <Chip
              key={g.key}
              active={group === g.key}
              onClick={() => {
                setGroup(g.key);
                setStatus((SUB_FILTERS[g.key]?.[0]?.key) ?? "all");
                setPage(1);
                setOpenId(null);
              }}
            >
              {g.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Aggregated spend / visa fees across every visa account */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-3">
          <div className="text-xs font-bold text-muted-foreground mb-2 px-1">الإنفاق</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="الإنفاق الشهري" value={money(t?.monthSpend)} />
            <Stat label="الإنفاق اليومي" value={money(t?.daySpend)} />
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/70 p-3">
          <div className="text-xs font-bold text-muted-foreground mb-2 px-1">رسوم الفيزا</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="رسوم الفيزا الشهرية" value={money(t?.monthFees)} />
            <Stat label="رسوم الفيزا اليومية" value={money(t?.dayFees)} />
          </div>
        </div>
      </div>



      <div className="rounded-3xl border border-border/60 bg-card/70 overflow-hidden">
        <div className="flex flex-wrap items-center justify-start gap-1 p-4">
          {(SUB_FILTERS[group] ?? []).map((s) => (
            <Chip
              key={s.key}
              active={status === s.key}
              onClick={() => {
                setStatus(s.key);
                setPage(1);
                setOpenId(null);
              }}
            >
              {s.label}
            </Chip>
          ))}
        </div>


        {q.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
        ) : !rows.length ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            جارٍ تحديث السجل تلقائياً — ستظهر المعاملات هنا بمجرد جلبها.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  {COLUMNS[group].map((c) => (
                    <th key={c} className="!p-4 text-right">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const badge = statusBadge(r.kind, r.status);
                  const d = (r.detail ?? {}) as Record<string, unknown>;
                  const pan4 = String(d["pan4"] ?? "").trim();
                  const brand = String(
                    brands[pan4] ?? d["cardBrand"] ?? d["brand"] ?? d["cardType"] ?? "",
                  );
                  const StatusCell = (
                    <td className="p-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </td>
                  );
                  const TimeCell = (
                    <td className="p-4 text-xs text-muted-foreground tabular-nums">{formatDateTime(r.time)}</td>
                  );
                  const AmountCell = (
                    <td
                      className={`p-4 font-bold tabular-nums ${
                        r.direction === "in" ? "text-emerald-400" : "text-destructive"
                      }`}
                      dir="ltr"
                    >
                      {r.direction === "in" ? "+" : "-"}
                      {amt(r.amount)}
                    </td>
                  );
                  const ActionCell = (
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={() => setOpenId((v) => (v === r.id ? null : r.id))}
                        className="table-btn"
                      >
                        التفاصيل
                        <ChevronDown className={`size-3.5 transition-transform ${openId === r.id ? "rotate-180" : ""}`} />
                      </button>
                    </td>
                  );
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                        {group === "txns" ? (
                          <>
                            <td className="p-4">
                              <div className="flex items-center justify-start gap-3">
                                <MerchantLogo name={r.title} />
                                <div className="min-w-0">
                                  <div className="truncate font-semibold">{r.title}</div>
                                  <div className="truncate text-[11px] text-muted-foreground">{r.accountName}</div>
                                </div>
                              </div>
                            </td>
                            <td
                              className={`p-4 text-center font-bold tabular-nums ${
                                r.direction === "in" ? "text-emerald-400" : "text-destructive"
                              }`}
                              dir="ltr"
                            >
                              {r.direction === "in" ? "+" : "-"}
                              {r.currency} {amt(r.amount)}
                            </td>
                            <td className="p-4 text-xs text-muted-foreground">{KIND_LABEL[r.kind] ?? r.kind}</td>
                            {StatusCell}
                            {TimeCell}
                            <td className="p-4">
                              {pan4 ? (
                                <span className="inline-flex items-center gap-2">
                                  <BrandBadge brand={brand} />
                                  <span className="font-bold tabular-nums">{pan4}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            {ActionCell}
                          </>
                        ) : group === "onchain" ? (
                          <>
                            <td className="p-4"><CoinCell coin={r.currency} /></td>
                            <td className="p-4"><ChainCell chain={String(d["chain"] ?? "")} /></td>
                            {AmountCell}
                            <td className="p-4 text-xs text-muted-foreground tabular-nums" dir="ltr">
                              {r.fee ? `${r.currency} ${amt(r.fee)}` : "—"}
                            </td>
                            {TimeCell}
                            {StatusCell}
                            {ActionCell}
                          </>
                        ) : group === "internal" ? (
                          <>
                            <td className="p-4"><CoinCell coin={r.currency} /></td>
                            {AmountCell}
                            <td className="p-4 text-xs text-muted-foreground" dir="ltr">
                              {String(d["address"] ?? "—") || "—"}
                            </td>
                            {StatusCell}
                            {TimeCell}
                            {ActionCell}
                          </>
                        ) : (
                          <>
                            <td className="p-4">
                              <div className="text-xs font-bold">
                                {KIND_LABEL[r.kind] ?? r.kind} {r.currency}
                              </div>
                              <div className="text-[11px] text-muted-foreground tabular-nums">{formatDateTime(r.time)}</div>
                            </td>
                            <td className="p-4 text-xs tabular-nums" dir="ltr">
                              {r.refId}
                            </td>
                            <td className="p-4 text-xs tabular-nums" dir="ltr">
                              {d["price"] ? `${String(d["fiat"] ?? "")} ${d["price"]}` : "—"}
                            </td>
                            <td className="p-4 tabular-nums" dir="ltr">
                              <div className="font-bold">
                                {d["fiatAmount"] ? `${String(d["fiat"] ?? "")} ${d["fiatAmount"]}` : "—"}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {r.currency} {amt(r.amount)}
                              </div>
                            </td>
                            <td className="p-4 text-xs">{String(d["counterparty"] ?? "—") || "—"}</td>
                            {StatusCell}
                            {ActionCell}
                          </>
                        )}
                      </tr>
                      {openId === r.id && (
                        <tr className="border-b border-border/40 bg-muted/20">
                          <td colSpan={COLUMNS[group]?.length ?? 7} className="p-4">
                            <LedgerRowDetails row={r} badgeText={badge.text} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 border-t border-border/40 p-4 text-xs">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="rounded-lg border border-border/60 px-3 py-1 disabled:opacity-40"
            >
              السابق
            </button>
            <span className="text-muted-foreground">
              صفحة {page} / {pages} — {total.toLocaleString("en-US")} سجل
            </span>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(p + 1, pages))}
              className="rounded-lg border border-border/60 px-3 py-1 disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Simplified read-only summary matching the reference design: a single block with
 * the most important transaction fields only, no extra raw sections.
 */
export function LedgerRowDetails({ row, badgeText }: { row: any; badgeText: string }) {
  const d = (row.detail ?? {}) as Record<string, unknown>;
  const cur = String(row.currency || "USD");
  const val = (k: string) => {
    const v = d[k];
    return v === null || v === undefined || v === "" ? null : String(v);
  };

  // Only fields the source account actually provides for this movement type.
  const base: [string, string][] = [
    ["الحساب / الفيزا", row.accountName || "—"],
    ["نوع المعاملة", KIND_LABEL[row.kind] ?? row.kind],
    ["الحالة", badgeText],
    ["تاريخ ووقت المعاملة", formatDateTime(row.time)],
    ["معرّف المعاملة", row.refId],
    ["العملة", cur],
  ];

  const extra: [string, string][] = [];
  const add = (label: string, v: string | null) => {
    if (v) extra.push([label, v]);
  };

  if (row.kind === "card" || row.kind === "refund") {
    add("حالة المعاملة", String(row.status || "") || null);
    add("مرحلة المعاملة", val("stage"));
    add("آخر 4 أرقام للبطاقة", val("pan4"));
    // Fee value exactly as the source account returns it; blank when absent.
    const feeSrc = val("totalFees") ?? val("feeAmount") ?? val("foreignTransactionFee");
    add("الرسوم", feeSrc ? `${String(val("feeCurrency") ?? cur)} ${amt(Number(feeSrc))}` : null);
  } else if (row.kind === "deposit" || row.kind === "withdraw") {
    add("نوع السلسلة", val("chain"));
    add("العنوان", val("address"));
    add("الرسوم", row.fee ? `${cur} ${amt(row.fee)}` : null);
    add("الحالة عند المزوّد", String(row.status || "") || null);
  } else if (row.kind === "internal_in" || row.kind === "internal_out") {
    add("العنوان", val("address"));
    add("الحالة عند المزوّد", String(row.status || "") || null);
  } else {
    add("الطرف المقابل", val("counterparty"));
    add("السعر", val("price"));
    add("المبلغ", val("fiatAmount"));
    add("العملة النقدية", val("fiat"));
    add("الحالة عند المزوّد", String(row.status || "") || null);
  }

  const summary = [...base, ...extra];

  return (
    <div className="rounded-2xl border border-border/50 bg-muted/10 p-4" dir="rtl">
      <div className="mb-3 text-sm font-black">ملخص المعاملة</div>
      <FieldGrid rows={summary} />
    </div>
  );
}

function FieldGrid({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-3 border-b border-border/30 pb-2">
          <div className="shrink-0 text-[11px] text-muted-foreground">{label}</div>
          <div className="break-all text-left text-sm font-semibold" dir="auto">
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
