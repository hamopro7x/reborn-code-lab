import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getBybitActivity, getBybitCardRewards, getBybitCardTransactions } from "@/lib/bybit.functions";
import { getBybitCardTransactionDetail } from "@/lib/bybit-card-detail.functions";
import { getBybitCards, type BybitCard } from "@/lib/bybit-cards.functions";
import { loadManualCards, saveManualCards, last4Of, type ManualCard } from "@/lib/manual-cards";

import { OnChainTransfersSection } from "@/components/admin/OnChainTransfersSection";
import { InternalTransfersSection } from "@/components/admin/InternalTransfersSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { dateLineAr, statusAr } from "@/lib/format-ar";
import { toast } from "sonner";

import { RefreshCw, CreditCard, AlertTriangle, ChevronDown, Plus, Trash2 } from "lucide-react";


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
  txnType?: string;
  paymentId?: string;
  points?: string;
  settlementDate?: string;
  settleAmount?: string;
  settleCurrency?: string;
  authAmount?: string;
  mcc?: string;
  mccDesc?: string;
  location?: string;
  merchantEmail?: string;
  merchantWebsite?: string;

};

const money = (n: number) =>
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateLine = (ms: number) => dateLineAr(ms);


const isRefund = (r: Row) => r.amount > 0 || /refund|reversal|cashback/i.test(r.status + r.merchant);


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

/** بطاقة باي بت بنفس شكل صفحة إدارة البطاقات */
function BybitCardVisual({
  brand,
  last4,
  kind,
}: {
  brand?: string;
  last4?: string;
  kind?: string;
}) {
  return (
    <div className="relative flex h-40 flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-black p-5 text-white shadow-lg">
      <div>
        {kind && (
          <div className="text-[11px] font-medium text-white/70">
            {kind === "virtual" ? "Virtual" : "Physical"}
          </div>
        )}
        <div className="text-xl font-black tracking-tight">
          BYB<span className="text-amber-400">I</span>T
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <div className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold tabular-nums" dir="ltr">
          {last4 || "----"}****
        </div>
        <CardBrandIcon brand={brand} last4={last4 ?? ""} />
      </div>
    </div>
  );
}

/** نافذة إضافة كرت جديد */
function AddCardDialog({ onAdd }: { onAdd: (card: ManualCard) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState<"visa" | "mastercard">("visa");
  const [kind, setKind] = useState<"virtual" | "physical">("virtual");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [saving, setSaving] = useState(false);

  const copy = async (value: string, label: string) => {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value.trim());
      toast.success(`تم نسخ ${label}`);
    } catch {
      toast.error("تعذر النسخ");
    }
  };

  const submit = async () => {
    if (!name.trim() || !number.replace(/\D/g, "")) {
      toast.error("اكتب اسم صاحب البطاقة ورقمها");
      return;
    }
    setSaving(true);
    try {
      await onAdd({
        id: crypto.randomUUID(),
        name: name.trim(),
        brand,
        kind,
        number: number.trim(),
        expiry: expiry.trim(),
        cvv: cvv.trim(),
      });
      toast.success("تم إضافة الكرت");
      setOpen(false);
      setName("");
      setNumber("");
      setExpiry("");
      setCvv("");
    } catch {
      toast.error("تعذر حفظ الكرت");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-background/40 p-4 text-sm text-muted-foreground transition-colors hover:border-amber-400 hover:text-amber-400"
        >
          <Plus className="size-6" />
          إضافة كرت جديد
        </button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>كرت جديد</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="mc-name">اسم صاحب البطاقة</Label>
            <Input id="mc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: أحمد محمد" />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="mc-number">رقم البطاقة</Label>
              <button
                type="button"
                onClick={() => copy(number, "رقم البطاقة")}
                className="text-[11px] font-bold text-amber-400 hover:underline"
              >
                نسخ
              </button>
            </div>
            <Input
              id="mc-number"
              dir="ltr"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="5596 1234 5678 4938"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mc-expiry">تاريخ الانتهاء</Label>
              <Input id="mc-expiry" dir="ltr" value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="MM/YY" />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="mc-cvv">رمز CVV</Label>
                <button
                  type="button"
                  onClick={() => copy(cvv, "رمز CVV")}
                  className="text-[11px] font-bold text-amber-400 hover:underline"
                >
                  نسخ
                </button>
              </div>
              <Input
                id="mc-cvv"
                dir="ltr"
                inputMode="numeric"
                maxLength={4}
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, ""))}
                placeholder="123"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>النوع</Label>
            <div className="flex gap-2">
              {(["virtual", "physical"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-xs font-bold ${
                    kind === k ? "border-amber-400 text-amber-400" : "text-muted-foreground"
                  }`}
                >
                  {k === "virtual" ? "افتراضية" : "فعلية"}
                </button>
              ))}
            </div>
          </div>

            <div className="grid gap-1.5">
              <Label>النوع</Label>
              <div className="flex gap-2">
                {(["virtual", "physical"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex-1 rounded-lg border px-2 py-2 text-xs font-bold ${
                      kind === k ? "border-amber-400 text-amber-400" : "text-muted-foreground"
                    }`}
                  >
                    {k === "virtual" ? "افتراضية" : "فعلية"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>الأيقونة</Label>
            <div className="flex gap-2">
              {(["visa", "mastercard"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBrand(b)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${
                    brand === b ? "border-amber-400 text-amber-400" : "text-muted-foreground"
                  }`}
                >
                  <CardBrandIcon brand={b} last4="" />
                  {b === "visa" ? "Visa" : "Mastercard"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving}>
            {saving ? "جاري الحفظ..." : "إضافة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export function CardTransactionsTab() {
  const fetchCard = useServerFn(getBybitCardTransactions);
  const fetchRewards = useServerFn(getBybitCardRewards);
  const fetchActivity = useServerFn(getBybitActivity);
  const [tab, setTab] = useState<"all" | "purchase_ok" | "purchase_failed" | "refund">("all");
  const [section, setSection] = useState<"transactions" | "onchain" | "internal">("transactions");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showCard, setShowCard] = useState(false);
  const queryClient = useQueryClient();
  const { data: manualCards = [] } = useQuery({
    queryKey: ["manual-cards"],
    queryFn: loadManualCards,
  });
  const addManualCard = async (card: ManualCard) => {
    const next = [...manualCards, card];
    await saveManualCards(next);
    queryClient.setQueryData(["manual-cards"], next);
  };
  const removeManualCard = async (id: string) => {
    const next = manualCards.filter((c) => c.id !== id);
    await saveManualCards(next);
    queryClient.setQueryData(["manual-cards"], next);
  };
  const fetchCards = useServerFn(getBybitCards);

  const { data: cardsData, isLoading: cardsLoading } = useQuery({
    queryKey: ["bybit-cards"],
    queryFn: () => fetchCards(),
    enabled: showCard,
    retry: false,
  });



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
        txnType: String(raw.txnType ?? ""),
        paymentId: String(raw.paymentId ?? ""),
        points: String(raw.points ?? ""),
        settlementDate: String(raw.settlementDate ?? ""),
        settleAmount: String(raw.settleAmount ?? ""),
        mcc: String(raw.mcc ?? ""),
        mccDesc: String(raw.mccDesc ?? ""),
        location: String(raw.location ?? ""),
        merchantEmail: String(raw.merchantEmail ?? ""),
        merchantWebsite: String(raw.merchantWebsite ?? ""),
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
    const failed = statusAr(r.status) === "\u0641\u0627\u0634\u0644\u0629";
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

  // الإنفاق اليومي (اليوم فقط، المشتريات فقط)
  const dayStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }, []);
  const dailySpend = rows
    .filter((r) => !isRefund(r) && r.occurredAt >= dayStart)
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
  // بيانات بطاقتي — من أحدث معاملة تحمل بيانات البطاقة
  const myCard = useMemo(() => {
    const r = rows.find((x) => x.last4);
    return { last4: r?.last4 ?? "", brand: r?.brand ?? "", cardKind: r?.cardKind ?? "" };
  }, [rows]);




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
              <button
                type="button"
                onClick={() => setShowCard((v) => !v)}
                aria-expanded={showCard}
                className="flex h-12 w-20 items-center justify-center rounded-lg bg-foreground/90 text-background text-xs font-bold transition-opacity hover:opacity-90"
              >
                <CreditCard className="size-4 me-1" /> بطاقة
              </button>
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {showCard && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" dir="rtl">
              {(cardsData?.cards ?? []).length === 0 && (
                <div className="rounded-2xl border bg-background/70 p-4">
                  <BybitCardVisual brand={myCard.brand} last4={myCard.last4} kind={myCard.cardKind} />
                  <div className="mt-3 text-[11px] text-muted-foreground">
                    {cardsLoading
                      ? "جاري جلب بيانات البطاقة..."
                      : "تعذر جلب قائمة البطاقات من باي بت."}
                  </div>
                </div>
              )}

              {((cardsData?.cards ?? []) as BybitCard[]).map((c) => {
                const brandName =
                  (c.brand || myCard.brand) === "mastercard"
                    ? "Mastercard"
                    : (c.brand || myCard.brand) === "visa"
                      ? "Visa"
                      : "Card";
                const kind = c.kind || myCard.cardKind;
                const active = statusAr(c.status) === "ناجحة" || /active|normal|1/i.test(c.status);
                return (
                  <div key={c.id} className="rounded-2xl border bg-background/70 p-4">
                    <div className="flex flex-wrap items-center justify-end gap-2 text-right">
                      <h3 className="text-base font-black">
                        {brandName} {kind === "physical" ? "Physical" : "Virtual"}
                      </h3>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          active ? "bg-amber-400 text-black" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {active ? "Active" : c.status || "—"}
                      </span>
                    </div>
                    <div className="mt-3">
                      <BybitCardVisual
                        brand={c.brand || myCard.brand}
                        last4={c.last4 || myCard.last4}
                        kind={kind}
                      />
                    </div>
                  </div>
                );
              })}

              {manualCards.map((c) => (
                <div key={c.id} className="rounded-2xl border bg-background/70 p-4">
                  <div className="flex flex-wrap items-center justify-end gap-2 text-right">
                    <h3 className="text-base font-black">{c.name}</h3>
                    <span className="rounded bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-black">Active</span>
                    <button
                      type="button"
                      onClick={() => removeManualCard(c.id)}
                      className="me-auto text-muted-foreground transition-colors hover:text-destructive"
                      aria-label="حذف الكرت"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-3">
                    <BybitCardVisual brand={c.brand} last4={last4Of(c.number)} kind={c.kind} />
                  </div>
                  {c.expiry && (
                    <div className="mt-2 text-right text-[11px] text-muted-foreground" dir="ltr">
                      {c.expiry}
                    </div>
                  )}
                </div>
              ))}

              <AddCardDialog onAdd={addManualCard} />
            </div>
          )}






          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-background/60 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">الإنفاق الشهري</div>
              <div className="text-lg font-bold tabular-nums">${money(spendForRate)}</div>
              <div className="text-[10px] text-muted-foreground">
                {rows.length === 0 ? "يبدأ العد من أول معاملة جديدة" : "الشهر الحالي · المشتريات"}
              </div>
            </div>
            <div className="rounded-xl border bg-background/60 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">الإنفاق اليومي</div>
              <div className="text-lg font-bold tabular-nums">${money(dailySpend)}</div>
              <div className="text-[10px] text-muted-foreground">
                {rows.length === 0 ? "يبدأ العد من أول معاملة جديدة" : "اليوم · المشتريات"}
              </div>
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
                const st = statusAr(r.status);
                const failed = st === "فاشلة";
                const open = openId === r.id;
                return (
                  <Fragment key={r.id}>
                  <tr className="border-b border-border/40 hover:bg-muted/20">
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : r.id)}
                        className="inline-flex items-center gap-1 font-semibold text-amber-500 hover:underline"
                      >
                        التفاصيل
                        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
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
                      className={`px-4 py-4 ${failed ? "text-destructive" : "text-emerald-500"}`}
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
                  {open && (
                    <tr className="bg-muted/10">
                      <td colSpan={6} className="p-0">
                        <TxnDetails r={r} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
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

    </div>

  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`break-all text-xs font-semibold tabular-nums ${accent ? "text-amber-500" : ""}`}>
        {value || "—"}
      </div>
    </div>
  );
}

/** أسماء عربية للحقول الإضافية اللي بترجع من باي بت */
const FIELD_LABELS: Record<string, string> = {
  txnId: "Transaction ID",
  paymentId: "Payment ID",
  orderNo: "رقم الطلب",
  txnType: "نوع المعاملة",
  bizType: "نوع العملية",
  points: "النقاط المكتسبة",
  point: "النقاط المكتسبة",
  rebateAmount: "مبلغ الاسترداد",
  rebateRate: "نسبة الاسترداد",
  settleAmount: "مبلغ التسوية",
  settleCurrency: "عملة التسوية",
  settleDate: "تاريخ التسوية",
  settleTime: "وقت التسوية",
  basicAmount: "المبلغ الأساسي",
  basicCurrency: "العملة الأساسية",
  paidAmount: "المبلغ المدفوع",
  paidCurrency: "عملة الدفع",
  authAmount: "المبلغ المصرّح",
  transactionAmount: "مبلغ المعاملة",
  transactionCurrency: "عملة المعاملة",
  fee: "الرسوم",
  feeAmount: "الرسوم",
  fxRate: "سعر التحويل",
  exchangeRate: "سعر الصرف",
  mcc: "فئة التاجر (MCC)",
  merchCategoryCode: "كود فئة التاجر",
  merchCategoryDesc: "وصف فئة التاجر",
  merchName: "اسم التاجر",
  merchCity: "مدينة التاجر",
  merchCountry: "دولة التاجر",
  merchEmail: "البريد الإلكتروني للتاجر",
  merchWebsite: "الموقع الإلكتروني للتاجر",
  cardType: "نوع البطاقة",
  pan4: "آخر 4 أرقام",
  status: "الحالة",
  tradeStatus: "حالة العملية",
  txnCreate: "وقت الإنشاء",
  createTime: "وقت الإنشاء",
  currency: "العملة",
  entity: "الجهة",
  pan6: "بادئة البطاقة (BIN)",
  transactionCurrencyAmount: "المبلغ بعملة المعاملة",
  interchangeFee: "رسوم الشبكة",
  totalTax: "إجمالي الضرائب",
  paidFiat: "المدفوع بالعملة الورقية",
  withdrawalFee: "رسوم السحب",
  fxPad: "هامش سعر الصرف",
  declinedReason: "سبب الرفض",
};

const HIDDEN_FIELDS = new Set(["retCode", "retMsg", "extInfo", "time"]);

function TxnDetails({ r }: { r: Row }) {
  const refund = isRefund(r);
  const st = statusAr(r.status);
  const cur = r.currency || "USD";

  const fetchDetail = useServerFn(getBybitCardTransactionDetail);
  const { data: detailRes, isLoading: detailLoading } = useQuery({
    queryKey: ["bybit-card-txn-detail", r.id, r.paymentId ?? ""],
    queryFn: () => fetchDetail({ data: { txnId: r.id, paymentId: r.paymentId ?? "" } }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const d = detailRes?.detail ?? {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = d[k];
      if (v && v !== "0" && v !== "0.00") return v;
    }
    return "";
  };

  const money2 = (v: string) =>
    Number.isFinite(Number(v))
      ? Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : v;

  const settleRaw = r.settleAmount && Number(r.settleAmount) > 0
    ? r.settleAmount
    : pick("settleAmount", "settlementAmount", "payAmount", "paidAmount", "billAmount");
  const settleCur =
    r.settleCurrency || pick("settleCurrency", "settlementCurrency", "payCurrency", "paidCurrency") || cur;
  const settle = settleRaw ? `${settleCur} ${money2(settleRaw)}` : "";

  const settleDate = r.settlementDate || (() => {
    const v = pick("settleDate", "settlementDate", "settleTime", "postDate");
    if (!v) return "";
    return /^\d{10,13}$/.test(v)
      ? new Date(v.length === 10 ? Number(v) * 1000 : Number(v)).toISOString().slice(0, 10)
      : v.slice(0, 10);
  })();

  const points = r.points || pick("points", "point", "pointsEarned", "rewardPoints", "rewardPoint");
  const paymentId = r.paymentId || pick("paymentId", "payId", "orderNo");
  const mccCode = r.mcc || pick("mcc", "merchCategoryCode");
  const mccDesc = r.mccDesc || pick("merchCategoryDesc", "mccDesc");
  const mcc = mccDesc ? `${mccDesc}${mccCode ? ` (${mccCode})` : ""}` : mccCode;
  const location =
    r.location ||
    [pick("merchCity", "merchantCity", "city"), pick("merchCountry", "merchantCountry", "country")]
      .filter(Boolean)
      .join(", ");
  const email = r.merchantEmail || pick("merchEmail", "merchantEmail", "contactEmail");
  const website = r.merchantWebsite || pick("merchWebsite", "merchantWebsite", "merchUrl", "contactWebsite");
  const fee = pick("fee", "feeAmount", "transactionFee", "totalFees", "foreignTransactionFee");
  const fxRate = pick("fxRate", "exchangeRate", "rate");
  const cashback = pick("rebateAmount", "cashbackAmount", "bonusAmount");

  const usedKeys = new Set([
    "txnId", "paymentId", "payId", "orderNo", "points", "point", "pointsEarned", "rewardPoints", "rewardPoint",
    "settleAmount", "settlementAmount", "payAmount", "paidAmount", "billAmount", "settleCurrency",
    "settlementCurrency", "payCurrency", "paidCurrency",
    "settleDate", "settlementDate", "settleTime", "postDate", "mcc", "merchCategoryCode", "merchCategoryDesc",
    "mccDesc", "mccCode", "merchCity", "merchantCity", "city", "merchCountry", "merchantCountry", "country", "merchEmail",
    "merchantEmail", "contactEmail", "merchWebsite", "merchantWebsite", "merchUrl", "contactWebsite",
    "fee", "feeAmount", "transactionFee", "totalFees", "foreignTransactionFee", "fxRate", "exchangeRate", "rate",
    "rebateAmount", "cashbackAmount", "bonusAmount",
    "merchName", "status", "tradeStatus", "pan4", "last4", "cardLast4", "cardType", "txnCreate", "createTime",
    "uid", "side",
  ]);
  const extras = (detailRes?.fields ?? []).filter(
    (f: { key: string; value: string }) => !usedKeys.has(f.key) && !HIDDEN_FIELDS.has(f.key),
  );

  return (
    <div dir="rtl" className="space-y-5 border-t border-border/40 px-4 py-5 sm:px-8">
      <section>
        <h4 className="mb-3 text-sm font-bold">تفصيل العملة والرسوم</h4>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="مبلغ المعاملة" value={`${refund ? "+" : "-"}${cur} ${money(r.amount)}`} />
          <Field label="مبلغ التسوية" value={settle} />
          <Field label="النقاط المكتسبة" value={points} accent />
          <Field label="Payment ID" value={paymentId} />
          <Field label="Transaction ID" value={r.id} />
          <Field label="تاريخ التسوية" value={settleDate} />
          <Field label="الرسوم" value={fee ? `${cur} ${money2(fee)}` : ""} />
          <Field label="سعر التحويل" value={fxRate} />
          <Field label="مبلغ الاسترداد" value={cashback ? money2(cashback) : ""} accent />
        </div>
      </section>

      <section className="border-t border-border/40 pt-4">
        <h4 className="mb-3 text-sm font-bold">تفاصيل التاجر</h4>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="وصف التاجر" value={r.merchant || pick("merchName")} />
          <Field label="فئة التاجر (MCC)" value={mcc} />
          <Field label="الموقع" value={location} />
          <Field label="البريد الإلكتروني للتواصل" value={email} />
          <Field label="الموقع الإلكتروني للتواصل" value={website} />
        </div>
      </section>

      <section className="border-t border-border/40 pt-4">
        <h4 className="mb-3 text-sm font-bold">بيانات البطاقة</h4>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="الحالة" value={st} />
          <Field label="الوقت" value={dateLine(r.occurredAt)} />
          <Field label="النوع" value={refund ? "مبلغ مسترد" : "شراء بالبطاقة"} />
          <Field label="آخر 4 أرقام" value={r.last4 || "••••"} />
          <Field label="نوع البطاقة" value={cardKindLabel(r.cardKind) || ""} />
        </div>
      </section>

      {extras.length > 0 && (
        <section className="border-t border-border/40 pt-4">
          <h4 className="mb-3 text-sm font-bold">بيانات إضافية من باي بت</h4>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {extras.map((f: { key: string; value: string }) => (
              <Field key={f.key} label={FIELD_LABELS[f.key] ?? f.key} value={f.value} />
            ))}
          </div>
        </section>
      )}

      {detailLoading && (
        <div className="text-[11px] text-muted-foreground">جاري جلب التفاصيل الكاملة من باي بت…</div>
      )}
      {!detailLoading && detailRes && !detailRes.found && (
        <div className="text-[11px] text-muted-foreground">
          باقي الحقول (النقاط والتسوية) بتظهر من باي بت بعد تسوية المعاملة.
        </div>
      )}
    </div>
  );
}

