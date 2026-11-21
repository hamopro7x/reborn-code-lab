import { Fragment } from "react";
import { dt, Chip, Empty, CoinLogo, ChainLogo } from "@/components/admin/bybit/BybitVisuals";
import { Layers, ArrowUp, ArrowDown, ChevronDown } from "lucide-react";

type FieldDef = [string, string];

const CORE_FIELDS: FieldDef[] = [
  ["txnId", "معرف المعاملة"],
  ["orderId", "معرف الطلب / المرجع"],
  ["paymentId", "معرف الدفع"],
  ["authCode", "كود التفويض"],
  ["stage", "مرحلة المعاملة"],
  ["eventCode", "كود الحدث"],
  ["createdAt", "تاريخ الإنشاء"],
  ["updatedAt", "آخر تحديث"],
];

const AMOUNT_FIELDS: FieldDef[] = [
  ["transactionAmount", "مبلغ المعاملة"],
  ["transactionCurrency", "عملة المعاملة"],
  ["localAmount", "المبلغ بالعملة المحلية"],
  ["localCurrency", "العملة المحلية"],
  ["grossAmount", "المبلغ الإجمالي"],
  ["netAmount", "الصافي"],
  ["feeAmount", "الرسوم"],
  ["foreignTxnFee", "رسوم المعاملة الأجنبية"],
  ["tax", "الضريبة"],
  ["shipping", "الشحن"],
  ["paidWithCrypto", "المدفوع بالعملة الرقمية"],
  ["paidWithFiat", "المدفوع نقدا"],
  ["protectionEligibility", "أهلية الحماية"],
];

const PROCESSOR_FIELDS: FieldDef[] = [
  ["responseCode", "كود استجابة المعالج"],
  ["declineCode", "كود الرفض"],
  ["declineReason", "سبب الرفض"],
  ["avsCode", "نتيجة AVS"],
  ["cvvCode", "نتيجة CVV"],
  ["paymentAdviceCode", "Payment Advice Code"],
  ["apiErrorCode", "كود خطأ الـ API"],
];

const MERCHANT_FIELDS: FieldDef[] = [
  ["merchantName", "اسم التاجر"],
  ["mcc", "فئة التاجر (MCC)"],
  ["merchantLocation", "الموقع"],
  ["merchantWebsite", "الموقع الإلكتروني"],
  ["merchantEmail", "البريد الإلكتروني"],
  ["merchantDescription", "وصف التاجر"],
  ["terminalId", "معرف الطرفية"],
  ["storeId", "معرف المتجر"],
];


function has(d: Record<string, string | number | null>, k: string) {
  return d[k] !== null && d[k] !== undefined && d[k] !== "";
}

const DATE_KEYS = new Set(["createdAt", "updatedAt", "txnCreate"]);

function fmtValue(key: string, value: string | number | null): string {
  const s = String(value ?? "").trim();
  if (!s) return "—";
  if (DATE_KEYS.has(key)) {
    const n = Number(s);
    if (Number.isFinite(n) && n > 1_000_000_000) return dt(n < 1e12 ? n * 1000 : n);
  }
  if (/^-?\d+(\.\d+)?$/.test(s) && s.includes(".")) {
    const n = Number(s);
    if (Number.isFinite(n)) {
      const abs = Math.abs(n);
      const digits = abs > 0 && abs < 0.01 ? 6 : 2;
      return n.toLocaleString("en-US", { maximumFractionDigits: digits });
    }
  }
  if (/^-?\d+(\.\d+)?[eE][-+]?\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return n === 0 ? "0" : n.toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  return s;
}

/**
 * Fee breakdown per transaction, read from the transaction's own data.
 * A fee is only shown when the provider actually reports one — either as an
 * explicit fee field, or as the gap between the charged total and the
 * transaction amount. Fee-free transactions show the full amount instead.
 */
function feeBreakdown(txn: any) {
  const d = (txn?.detail ?? {}) as Record<string, any>;
  const num = (v: any) => {
    const n = Number(v ?? NaN);
    return Number.isFinite(n) ? Math.abs(n) : null;
  };
  const total = num(txn?.amount) ?? num(d["basicAmount"]) ?? num(d["grossAmount"]);
  const net = num(d["transactionAmount"]) ?? num(d["basicAmount"]);

  let fee: number | null = null;
  for (const k of ["foreignTxnFee", "feeAmount", "fee", "handlingFee"]) {
    const n = num(d[k]);
    if (n) { fee = n; break; }
  }
  if (fee === null && total !== null && net !== null && total - net > 0.0049) fee = total - net;

  const spend = fee !== null && total !== null ? total - fee : (net ?? total);
  return { total, fee, spend };
}

export function TxnDetails({ txn }: { txn: any }) {
  const d = (txn?.detail ?? {}) as Record<string, string | number | null>;
  const { total, fee, spend } = feeBreakdown(txn);
  const cur = String(txn?.currency || "USD");
  const money = (n: number) => `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const sections = [
    { defs: CORE_FIELDS, title: "بيانات المعاملة الأساسية" },
    { defs: AMOUNT_FIELDS, title: "تفصيل العملة والرسوم" },
    { defs: PROCESSOR_FIELDS, title: "بيانات المعالج وسبب الرفض" },
    { defs: MERCHANT_FIELDS, title: "تفاصيل التاجر" },
  ]
    .map((s) => ({ ...s, fields: s.defs.filter(([k]) => has(d, k)) }))
    .filter((s) => s.fields.length);

  return (
    <div className="rounded-2xl border border-border/50 bg-muted/10 p-4" dir="rtl">
      <div className="flex flex-col gap-5">
        {sections.map((s) => (
          <div key={s.title}>
            <div className="mb-3 text-sm font-black">{s.title}</div>
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {s.fields.map(([k, label]) => (
                <div key={k} className="flex items-start justify-between gap-3 border-b border-border/30 pb-2">
                  <div className="shrink-0 text-[11px] text-muted-foreground">{label}</div>
                  <div className="break-all text-left text-sm font-semibold" dir="auto">
                    {fmtValue(k, d[k])}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div>
          <div className="mb-3 text-sm font-black">الرسوم والمبلغ المحتسب</div>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["إجمالي المعاملة", total !== null ? money(total) : "—"],
              ["الرسوم", fee !== null && fee > 0 ? money(fee) : "بدون رسوم"],
              ["المحتسب في الصرف الشهري", spend !== null ? money(spend) : "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 border-b border-border/30 pb-2">
                <div className="shrink-0 text-[11px] text-muted-foreground">{label}</div>
                <div className="break-all text-left text-sm font-semibold" dir="auto">{value}</div>
              </div>
            ))}
          </div>
        </div>
        {!sections.length && (
          <div className="text-xs text-muted-foreground">لا توجد تفاصيل إضافية لهذه المعاملة.</div>
        )}
      </div>
    </div>
  );
}




export function AssetTable({
  q, title, inChip, outChip, showAddress, icon, hideFeeOnDeposit, hideChain,
}: { q: any; title: string; inChip: string; outChip: string; showAddress: boolean; icon?: boolean; hideFeeOnDeposit?: boolean; hideChain?: boolean }) {
  const [dir, setDir] = usePersistentState<"out" | "in">(`bybit.asset.${title}.dir`, "out");
  const [openId, setOpenId] = usePersistentState<string | null>(`bybit.asset.${title}.open`, null);
  const deposits: any[] = q.data?.deposits ?? [];
  const withdrawals: any[] = q.data?.withdrawals ?? [];
  const rows = dir === "in" ? deposits : withdrawals;
  const showFee = !showAddress && !(hideFeeOnDeposit && dir === "in");
  const colCount = 4 + (hideChain ? 0 : 1) + (showAddress ? 1 : showFee ? 1 : 0);

  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 overflow-hidden">
      <div className={`flex items-center gap-2 p-4 ${title ? "justify-between" : "justify-start"}`}>
        {title && (
          <div className="text-base font-black inline-flex items-center gap-2">
            {title} {icon && <Layers className="size-4 text-muted-foreground" />}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Chip active={dir === "out"} onClick={() => setDir("out")}>
            <span className="inline-flex items-center gap-1"><ArrowUp className="size-3" /> {outChip}</span>
          </Chip>
          <Chip active={dir === "in"} onClick={() => setDir("in")}>
            <span className="inline-flex items-center gap-1"><ArrowDown className="size-3" /> {inChip}</span>
          </Chip>
        </div>
      </div>
      {q.isLoading ? (
        <Empty text="جار التحميل…" />
      ) : !rows.length ? (
        <Empty text="لا توجد سجلات" />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="p-3 text-right">عملة</th>
                {!hideChain && <th className="p-3 text-right">نوع السلسلة</th>}
                <th className="p-3 text-right">الكمية</th>
                {showAddress ? (
                  <th className="p-3 text-right">العنوان</th>
                ) : showFee ? (
                  <th className="p-3 text-right">الرسوم</th>
                ) : null}
                <th className="p-3 text-right">الحالة</th>
                <th className="p-3 text-right">التاريخ والوقت</th>
                <th className="p-3 text-right">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                <tr className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center justify-start gap-2">
                      <CoinLogo coin={r.coin} />
                      <span className="font-bold">{r.coin}</span>
                    </div>
                  </td>
                  {!hideChain && (
                    <td className="p-3">
                      <div className="flex items-center justify-start gap-2">
                        <ChainLogo chain={r.chain} />
                        <span className="text-sky-400 font-bold">{r.chain || "—"}</span>
                      </div>
                    </td>
                  )}
                  <td className={`p-3 font-bold tabular-nums ${r.amount < 0 ? "text-destructive" : "text-emerald-400"}`}>
                    {r.amount < 0 ? "-" : "+"}{Math.abs(r.amount)}
                  </td>
                  {showAddress ? (
                    <td className="p-3 text-xs text-muted-foreground">{r.address || "—"}</td>
                  ) : showFee ? (
                    <td className="p-3 text-xs text-muted-foreground tabular-nums">{r.coin} {r.fee}</td>
                  ) : null}
                  <td className="p-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-bold ${r.status === "فاشلة" ? "bg-red-500/15 text-red-400" : r.status === "ناجحة" ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground tabular-nums">{dt(r.time)}</td>
                  <td className="p-3">
                    <button
                      onClick={() => setOpenId((v: string | null) => (v === r.id ? null : r.id))}
                      className="table-btn"
                    >
                      التفاصيل
                      <ChevronDown className={`size-3.5 transition-transform ${openId === r.id ? "rotate-180" : ""}`} />
                    </button>
                  </td>
                </tr>
                {openId === r.id && (
                  <tr className="border-b border-border/40 bg-muted/20">
                    <td colSpan={colCount} className="p-4">
                      <AssetDetails row={r} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ASSET_DETAIL_LABELS: Array<[string, string]> = [
  ["id", "المعرف"],
  ["coin", "العملة"],
  ["chain", "نوع السلسلة"],
  ["amount", "الكمية"],
  ["fee", "الرسوم"],
  ["address", "العنوان"],
  ["txId", "معرف المعاملة"],
  ["status", "الحالة"],
];

function AssetDetails({ row }: { row: any }) {
  const fields = ASSET_DETAIL_LABELS.filter(
    ([k]) => row?.[k] !== null && row?.[k] !== undefined && row?.[k] !== "",
  );
  return (
    <div className="grid gap-4">
      <div className="text-sm font-black">تفاصيل المعاملة</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map(([k, label]) => (
          <div key={k}>
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div className="text-sm font-semibold break-all" dir="ltr">{String(row[k])}</div>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-muted-foreground">{dt(row.time)}</div>
    </div>
  );
}
