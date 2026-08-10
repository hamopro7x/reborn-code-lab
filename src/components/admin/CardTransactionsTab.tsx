import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getBybitActivity, getBybitCardRewards, getBybitCardTransactions } from "@/lib/bybit.functions";
import { OnChainTransfersSection } from "@/components/admin/OnChainTransfersSection";
import { InternalTransfersSection } from "@/components/admin/InternalTransfersSection";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dateLineAr } from "@/lib/format-ar";

import { RefreshCw, CreditCard, AlertTriangle, CheckCircle2 } from "lucide-react";

type Row = {
  id: string;
  occurredAt: number;
  amount: number;
  currency: string;
  merchant: string;
  status: string;
  last4: string;
  brand?: string;
  cardKind?: string;
};

const money = (n: number) =>
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateLine = (ms: number) => dateLineAr(ms);


const isRefund = (r: Row) => r.amount > 0 || /refund|reversal|cashback/i.test(r.status + r.merchant);

const statusLabel = (s: string) => {
  const v = s.toLowerCase();
  if (!s) return "ناجحة";
  if (/success|completed|filled|done/.test(v)) return "ناجحة";
  if (/pending|processing/.test(v)) return "قيد المعالجة";
  if (/fail|reject|declin/.test(v)) return "فاشلة";
  return s;
};

const merchantDomains: Record<string, string> = {
  tiktok: "tiktok.com",
  "tik tok": "tiktok.com",
  gpay: "pay.google.com",
  "google pay": "pay.google.com",
  google: "google.com",
  apple: "apple.com",
  "apple pay": "apple.com",
  paypal: "paypal.com",
  facebook: "facebook.com",
  meta: "meta.com",
  instagram: "instagram.com",
  netflix: "netflix.com",
  spotify: "spotify.com",
  youtube: "youtube.com",
  amazon: "amazon.com",
  aliexpress: "aliexpress.com",
  openai: "openai.com",
  chatgpt: "openai.com",
  microsoft: "microsoft.com",
  canva: "canva.com",
  adobe: "adobe.com",
  steam: "steampowered.com",
  telegram: "telegram.org",
  snapchat: "snapchat.com",
  x: "x.com",
  twitter: "x.com",
  binance: "binance.com",
  bybit: "bybit.com",
  uber: "uber.com",
  booking: "booking.com",
  shein: "shein.com",
  noon: "noon.com",
  vodafone: "vodafone.com.eg",
};

const merchantDomain = (name: string) => {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const hit = Object.keys(merchantDomains).find((k) => key.includes(k));
  if (hit) return merchantDomains[hit];
  const slug = key.replace(/[^a-z0-9]/g, "");
  return slug.length > 2 ? `${slug}.com` : null;
};

function MerchantIcon({ name }: { name: string }) {
  const domain = merchantDomain(name);
  const sources = domain
    ? [
        `https://icons.duckduckgo.com/ip3/${domain}.ico`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        `https://logo.clearbit.com/${domain}`,
      ]
    : [];
  const [idx, setIdx] = useState(0);

  if (idx >= sources.length) {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CreditCard className="size-3.5" />
      </span>
    );
  }
  return (
    <img
      src={sources[idx]}
      alt={`${name} logo`}
      loading="lazy"
      onError={() => setIdx((i) => i + 1)}
      className="size-7 shrink-0 rounded-full bg-background object-contain ring-1 ring-border"
    />
  );
}

/** أيقونة شبكة البطاقة كما تعرضها باي بت (فيزا / ماستركارد) */
function CardBrandIcon({ last4, brand }: { last4?: string; brand?: string }) {
  // بطاقتا الحساب تم التحقق منهما من شاشة Bybit نفسها. هذا يصحح السجلات
  // القديمة التي حُفظت قبل إصلاح ربط شبكة البطاقة.
  const verifiedBrand =
    last4 === "3256" ? "visa" : last4 === "8331" || last4 === "4350" ? "mastercard" : "";
  const net = (verifiedBrand || brand || "").toLowerCase();
  const mastercard = /master\s*card|master|\bmc\b/.test(net);
  const visa = /visa/.test(net);
  if (!mastercard && !visa) {
    return (
      <span
        className="inline-flex h-5 w-8 shrink-0 items-center justify-center rounded bg-muted text-[9px] font-bold text-muted-foreground"
        aria-label="بطاقة"
      >
        {last4 ? "CARD" : "••••"}
      </span>
    );
  }
  if (visa) {
    return (
      <svg viewBox="0 0 48 32" className="h-5 w-8 shrink-0" role="img" aria-label="Visa">
        <rect width="48" height="32" rx="4" fill="#1434CB" />
        <path
          d="M20.6 22h-3l2-12h3l-2 12Zm10.8-11.7c-.6-.2-1.5-.5-2.7-.5-2.9 0-5 1.5-5 3.7 0 1.6 1.5 2.5 2.7 3 1.2.6 1.6.9 1.6 1.4 0 .8-.9 1.1-1.8 1.1-1.2 0-1.9-.2-2.9-.6l-.4-.2-.4 2.5c.7.3 2 .6 3.4.6 3.2 0 5.3-1.5 5.3-3.9 0-1.3-.8-2.3-2.6-3.1-1.1-.5-1.8-.9-1.8-1.4 0-.5.5-1 1.8-1 1 0 1.8.2 2.4.4l.3.1.4-2.4ZM39 10h-2.3c-.7 0-1.3.2-1.6 1L30.7 22h3.2l.7-1.8h3.9l.4 1.8H41L39 10Zm-3.5 7.8 1.2-3.3.7 3.3h-1.9ZM17.9 10l-3 8.2-.3-1.6c-.6-1.9-2.4-4-4.4-5l3 10.4h3.3L21.2 10h-3.3Z"
          fill="#fff"
        />
        <path d="M11.9 10H7l-.1.5c3.8.9 6.4 3.2 7.4 5.9l-1.1-5.2c-.2-.8-.7-1.2-1.3-1.2Z" fill="#F7B600" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 32" className="h-5 w-8 shrink-0" role="img" aria-label="Mastercard">
      <rect width="48" height="32" rx="4" fill="#16181C" />
      <circle cx="20" cy="16" r="8" fill="#EB001B" />
      <circle cx="28" cy="16" r="8" fill="#F79E1B" />
      <path
        d="M24 9.6a8 8 0 0 0 0 12.8 8 8 0 0 0 0-12.8Z"
        fill="#FF5F00"
      />
    </svg>
  );
}

const cardKindLabel = (kind?: string) =>
  kind === "virtual" ? "افتراضية" : kind === "physical" ? "فعلية" : "";




export function CardTransactionsTab() {
  const fetchCard = useServerFn(getBybitCardTransactions);
  const fetchRewards = useServerFn(getBybitCardRewards);
  const fetchActivity = useServerFn(getBybitActivity);
  const [tab, setTab] = useState<"all" | "purchase_ok" | "purchase_failed" | "refund">("all");
  const [section, setSection] = useState<"transactions" | "onchain" | "internal">("transactions");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Row | null>(null);

  const perPage = 50;

  const { data: rewards } = useQuery({
    queryKey: ["bybit-card-rewards"],
    queryFn: () => fetchRewards(),
    refetchInterval: 60_000,
    retry: false,
  });

  const { data: activity } = useQuery({
    queryKey: ["bybit-activity-total"],
    queryFn: () => fetchActivity({ data: { days: 30 } }),
    refetchInterval: 30_000,
    retry: false,
  });
  const totalBalanceUsd = (activity?.balances ?? []).reduce(
    (s: number, c: { usdValue: number }) => s + c.usdValue,
    0,
  );

  const { data: live, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["bybit-card-live"],
    queryFn: () => fetchCard(),
    refetchInterval: 10_000,
    retry: false,
  });

  const { data: stored } = useQuery({
    queryKey: ["card-transactions"],
    queryFn: async () => {
      // السجل دائم ولا يُحذف — نجلب كل الصفحات على دفعات
      const all: any[] = [];
      const chunk = 1000;
      for (let from = 0; from < 20_000; from += chunk) {
        const { data, error } = await supabase
          .from("card_transactions")
          .select("id, occurred_at, amount, currency_code, merchant, status, card_last4, raw")
          .order("occurred_at", { ascending: false })
          .range(from, from + chunk - 1);
        if (error) throw error;
        all.push(...(data ?? []));
        if ((data?.length ?? 0) < chunk) break;
      }
      return all;
    },
    refetchInterval: 5_000,
  });

  // الرصيد يأتي من نفس نداء المعاملات (نفس المصدر)
  const balance = live?.balance;
  const spendingPower = balance?.usd ?? 0;

  const liveError = (live?.errors ?? [])[0];

  const rows = useMemo<Row[]>(() => {
    const a: Row[] = (live?.rows ?? []) as Row[];
    const b: Row[] = (stored ?? []).map((t: any) => {
      const raw = t.raw && typeof t.raw === "object" ? t.raw : {};
      return {
        id: t.id,
        occurredAt: new Date(t.occurred_at).getTime(),
        amount: -Math.abs(Number(t.amount)),
        currency: t.currency_code,
        merchant: t.merchant,
        status: t.status,
        last4: t.card_last4 ?? "",
        // Do not trust brand metadata persisted by older builds. Those builds
        // could save Visa for a Mastercard; verified cards are resolved by
        // CardBrandIcon and fresh live rows carry current platform metadata.
        brand: "",
        cardKind: String(raw.cardKind ?? raw.cardType ?? ""),
      };
    });
    // The live row contains Bybit's latest card metadata; keep it when the
    // same transaction is also present in local storage.
    return [...new Map([...b, ...a].map((row) => [row.id, row])).values()].sort(
      (x, y) => y.occurredAt - x.occurredAt,
    );
  }, [live, stored]);

  const filtered = rows.filter((r) => {
    if (tab === "all") return true;
    if (tab === "refund") return isRefund(r);
    const failed = statusLabel(r.status) === "\u0641\u0627\u0634\u0644\u0629";
    if (tab === "purchase_failed") return !isRefund(r) && failed;
    return !isRefund(r) && !failed;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  // الإنفاق الشهري (الشهر الحالي، المشتريات فقط)
  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }, []);
  const monthlySpend = rows
    .filter((r) => !isRefund(r) && r.occurredAt >= monthStart)
    .reduce((s, r) => s + Math.abs(r.amount), 0);

  // نسبة الاستراداد النقدي — تلقائي من المنصة، وإن لم تتوفر تُحسب من المعاملات
  const platformRate = rewards?.rate ?? null;
  const refunded = rows
    .filter((r) => isRefund(r) && r.occurredAt >= monthStart)
    .reduce((s, r) => s + Math.abs(r.amount), 0);
  const derivedRate = monthlySpend > 0 ? (refunded / monthlySpend) * 100 : null;
  const cashbackRate = platformRate ?? derivedRate;
  const spendForRate = rewards?.monthlySpend ?? monthlySpend;
  const cashbackEarned = cashbackRate == null ? null : (spendForRate * cashbackRate) / 100;




  return (
    <div className="space-y-4" dir="ltr">
      {/* Card hero — Bybit Card dashboard style */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="p-5 md:p-6 bg-gradient-to-br from-muted/60 to-transparent">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground">إجمالي الرصيد</div>
              <div className="mt-1 text-4xl font-black tracking-tight tabular-nums">
                USD {money(totalBalanceUsd)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex h-12 w-20 items-center justify-center rounded-lg bg-foreground/90 text-background text-xs font-bold">
                <CreditCard className="size-4 me-1" /> بطاقة
              </div>
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-background/60 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">الإنفاق الشهري</div>
              <div className="text-lg font-bold tabular-nums">${money(spendForRate)}</div>
              <div className="text-[10px] text-muted-foreground">
                {rows.length === 0 ? "يبدأ العد من أول معاملة جديدة" : "الشهر الحالي · المشتريات"}
              </div>
            </div>
            <div className="rounded-xl border bg-background/60 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">
                نسبة الاسترداد{rewards?.tier ? ` · ${rewards.tier}` : ""}
              </div>
              <div className="text-lg font-bold tabular-nums">
                {cashbackRate == null ? "—" : `${cashbackRate.toFixed(2)}%`}
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                {cashbackEarned != null
                  ? `≈ $${money(cashbackEarned)} استرداد`
                  : platformRate == null
                    ? "باي بت لا تتيح Pay Rewards عبر الـ API"
                    : "تلقائي · باي بت"}
              </div>
            </div>

            <div className="rounded-xl border bg-background/60 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">المعاملات</div>
              <div className="text-lg font-bold tabular-nums">{rows.length}</div>
            </div>
            <div className="rounded-xl border bg-background/60 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">العملة</div>
              <div className="text-lg font-bold">USD</div>
            </div>
          </div>
        </div>
      </div>

      {liveError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs flex items-start gap-2">
          <AlertTriangle className="size-4 mt-0.5" />
          <span className="text-muted-foreground">{liveError}</span>
        </div>
      )}

      {/* Section nav — same style as the storefront nav */}
      <nav className="flex flex-wrap items-center gap-1" dir="rtl">
        {(
          [
            ["transactions", "المعاملات"],
            ["onchain", "السحب والإيداع"],
            ["internal", "السحب والتحويل الداخلي"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={`rounded-lg px-4 py-2 text-sm transition-colors ${
              section === key
                ? "bg-primary/20 text-primary"
                : "text-foreground/80 hover:bg-secondary hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {section === "onchain" && <OnChainTransfersSection />}
      {section === "internal" && <InternalTransfersSection />}


      {/* Transactions — Bybit table layout */}

      <div className={`rounded-2xl border bg-card overflow-hidden ${section === "transactions" ? "" : "hidden"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-3">
          <h3 className="text-base font-bold">المعاملات</h3>
          <div className="flex gap-1">
            {(
              [
                ["refund", "المبلغ المسترد"],
                ["purchase_failed", "المشتريات الفاشلة"],
                ["purchase_ok", "المشتريات الناجحة"],
                ["all", "الكل"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setTab(key);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  tab === key
                    ? "bg-foreground text-background"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm [&_th]:border [&_th]:border-border/60 [&_td]:border [&_td]:border-border/40">
            <thead>
              <tr className="border-y bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-start font-semibold">الإجراء</th>
                <th className="px-4 py-3 text-start font-semibold">آخر 4 أرقام للبطاقة</th>
                <th className="px-4 py-3 text-start font-semibold">تاريخ ووقت المعاملة</th>
                <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                <th className="px-4 py-3 text-end font-semibold">إجمالي المبلغ المصرّح</th>
                <th className="px-4 py-3 text-end font-semibold">اسم التاجر</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                    {isLoading ? "جاري جلب المعاملات من باي بت…" : "لا توجد معاملات"}
                  </td>
                </tr>
              )}
              {pageRows.map((r) => {
                const refund = isRefund(r);
                const st = statusLabel(r.status);
                const failed = st === "فاشلة";
                return (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => setDetail(r)}
                        className="font-semibold text-amber-500 hover:underline"
                      >
                        التفاصيل
                      </button>

                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <CardBrandIcon last4={r.last4} brand={r.brand} />
                        <span className="font-bold tabular-nums">{r.last4 || "••••"}</span>
                        {cardKindLabel(r.cardKind) && (
                          <span className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {cardKindLabel(r.cardKind)}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-muted-foreground tabular-nums">{dateLine(r.occurredAt)}</td>
                    <td
                      className={`px-4 py-4 ${
                        failed
                          ? "text-muted-foreground"
                          : st === "قيد المعالجة"
                            ? "text-amber-500"
                            : "text-foreground"
                      }`}
                    >
                      {st}
                    </td>
                    <td
                      className={`px-4 py-4 font-semibold tabular-nums ${
                        failed ? "text-muted-foreground" : refund ? "text-emerald-500" : "text-destructive"
                      }`}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <span>
                          {refund ? "+" : "-"}
                          {r.currency || "USD"} {money(r.amount)}
                        </span>
                        
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2 font-medium">
                        <span>{r.merchant || "شراء بالبطاقة"}</span>
                        <MerchantIcon name={r.merchant || "Card"} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3">
          <div className="text-[11px] text-muted-foreground tabular-nums">
            إجمالي {filtered.length} معاملة · صفحة {currentPage} من {pageCount} · 50 لكل صفحة
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
              السابق
            </Button>
            {Array.from({ length: pageCount }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === pageCount || Math.abs(n - currentPage) <= 2)
              .map((n, i, arr) => (
                <span key={n} className="flex items-center gap-1">
                  {i > 0 && arr[i - 1] !== n - 1 && <span className="px-1 text-muted-foreground">…</span>}
                  <button
                    onClick={() => setPage(n)}
                    className={`min-w-8 rounded-md px-2 py-1 text-xs font-semibold tabular-nums transition ${
                      n === currentPage
                        ? "bg-foreground text-background"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {n}
                  </button>
                </span>
              ))}
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              التالي
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">تفاصيل المعاملة</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
                <MerchantIcon name={detail.merchant || "Card"} />
                <div className="flex-1">
                  <div className="text-sm font-bold">{detail.merchant || "شراء بالبطاقة"}</div>
                  <div className="text-xs text-muted-foreground">{statusLabel(detail.status)}</div>
                </div>
                <div
                  className={`text-lg font-black tabular-nums ${
                    isRefund(detail) ? "text-emerald-500" : "text-destructive"
                  }`}
                >
                  {isRefund(detail) ? "+" : "-"}
                  {detail.currency || "USD"} {money(detail.amount)}
                </div>
              </div>

              <ol className="space-y-3">
                {[
                  { label: "تم إرسال المعاملة", at: detail.occurredAt },
                  { label: "جاري المعالجة", at: detail.occurredAt },
                  {
                    label: statusLabel(detail.status) === "فاشلة" ? "فشلت المعاملة" : "اكتملت المعاملة",
                    at: detail.occurredAt,
                  },
                ].map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <div className="text-sm font-semibold">{s.label}</div>
                      <div className="text-xs text-muted-foreground">{dateLine(s.at)}</div>
                    </div>
                  </li>
                ))}
              </ol>

              <dl className="rounded-xl bg-muted/40 p-4 text-sm">
                {[
                  ["الحالة", statusLabel(detail.status)],
                  ["الوقت", dateLine(detail.occurredAt)],
                  ["النوع", isRefund(detail) ? "مبلغ مسترد" : "شراء بالبطاقة"],
                  ["اسم التاجر", detail.merchant || "—"],
                  ["العملة", detail.currency || "USD"],
                  ["المبلغ", money(detail.amount)],
                  ["آخر 4 أرقام", detail.last4 || "••••"],
                  ["نوع البطاقة", cardKindLabel(detail.cardKind) || "—"],
                  ["رقم المعاملة", detail.id],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4 py-1.5">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="break-all text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>

  );
}
