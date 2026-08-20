import { Fragment, useEffect, useState, useRef } from "react";
import { usePersistentState } from "@/lib/persistent-state";
import tonAsset from "@/assets/ton.png.asset.json";
import usdtOfficial from "@/assets/usdt-official.png.asset.json";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getBybitOverview, getBybitCardTxns, syncBybitCardTxns, syncAllBybitCardTxns, getBybitOnChain, getBybitInternal, getBybitP2P,
  getBybitCards,
  createBybitCard, deleteBybitCard, updateBybitCard, getBybitAccountInfo, saveBybitAccountInfo,
  listBybitAccounts, addBybitAccount, removeBybitAccount, updateBybitAccount, reorderBybitAccounts,
} from "@/lib/bybit.functions";
import { formatDateTime } from "@/lib/format";
import { BybitDocsCard } from "@/components/admin/BybitDocs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FintechBackdrop } from "@/components/admin/FintechBackdrop";
import { useAdminBack } from "@/components/admin/back-nav";
import { BybitLedgerPanel } from "@/components/admin/BybitLedgerPanel";



import { RefreshCw, CreditCard, Layers, ArrowUp, ArrowDown, ChevronDown, Loader2, Trash2, Plus, Download, Copy, Pencil, ChevronLeft, Wallet, ArrowDownUp, Search, BarChart3, Clock, PieChart } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const TAB_KEY = "bybit_active_tab";

const money = (n: number, c = "USD") =>
  `${c} ${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dt = (ms: number) => formatDateTime(ms);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-black">{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}

function Chip({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
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

function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>;
}

type CoinRow = { coin: string; balance: number; usd: number };

/** USDT is the primary coin — always show it, even with a zero balance. */
function visibleCoins(all: CoinRow[]): CoinRow[] {
  const merged = new Map<string, CoinRow>();
  for (const c of all ?? []) {
    const coin = String(c.coin).toUpperCase();
    if (coin === "USD") continue;
    const prev = merged.get(coin);
    if (prev) {
      prev.balance += c.balance;
      prev.usd += c.usd;
    } else {
      merged.set(coin, { ...c, coin });
    }
  }
  const rows = [...merged.values()].filter((c) => c.balance > 0);
  if (!rows.length) rows.push({ coin: "USDT", balance: 0, usd: 0 });
  return rows;
}

const MERCHANT_DOMAINS: Record<string, string> = {
  tiktok: "tiktok.com",
  "tiktok promote": "tiktok.com",
  facebook: "facebook.com",
  meta: "meta.com",
  google: "google.com",
  youtube: "youtube.com",
  openai: "openai.com",
  apple: "apple.com",
  amazon: "amazon.com",
  netflix: "netflix.com",
  spotify: "spotify.com",
  paypal: "paypal.com",
  microsoft: "microsoft.com",
  telegram: "telegram.org",
  x: "x.com",
  twitter: "x.com",
  canva: "canva.com",
  adobe: "adobe.com",
  binance: "binance.com",
  bybit: "bybit.com",
};

function merchantDomain(name: string) {
  const clean = String(name ?? "").trim().toLowerCase();
  if (!clean) return null;
  if (MERCHANT_DOMAINS[clean]) return MERCHANT_DOMAINS[clean];
  const first = clean.split(/[\s*_\-.,]+/)[0];
  if (MERCHANT_DOMAINS[first]) return MERCHANT_DOMAINS[first];
  if (/^[a-z0-9]{2,}$/.test(first)) return `${first}.com`;
  return null;
}

function MerchantLogo({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  const domain = merchantDomain(name);
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

const CHAIN_TO_ASSET: Record<string, string> = {
  bsc: "bnb",
  "bnb smart chain": "bnb",
  eth: "eth",
  erc20: "eth",
  btc: "btc",
  ton: "ton",
  trx: "trx",
  trc20: "trx",
  matic: "matic",
  polygon: "matic",
  arb: "arb",
  arbitrum: "arb",
  op: "op",
  optimism: "op",
  sol: "sol",
  avax: "avax",
  avalanche: "avax",
  base: "base",
  ftm: "ftm",
  fantom: "ftm",
  dot: "dot",
  polkadot: "dot",
  atom: "atom",
  cosmos: "atom",
  near: "near",
  algo: "algo",
  algorand: "algo",
  xrp: "xrp",
  ltc: "ltc",
  bch: "bch",
  etc: "etc",
  doge: "doge",
  shib: "shib",
  link: "link",
  uni: "uni",
  aave: "aave",
  mkr: "mkr",
  sushi: "sushi",
  crv: "crv",
  snx: "snx",
  comp: "comp",
  yfi: "yfi",
  "1inch": "1inch",
  grt: "grt",
  mana: "mana",
  sand: "sand",
  axs: "axs",
  enj: "enj",
  chz: "chz",
  bat: "bat",
  knc: "knc",
  zrx: "zrx",
  band: "band",
  rlc: "rlc",
  trb: "trb",
  perp: "perp",
  dodo: "dodo",
  bake: "bake",
  c98: "c98",
  mask: "mask",
  ray: "ray",
  fida: "fida",
  orca: "orca",
  srm: "srm",
};

function coinIconUrl(coin: string) {
  return coinIconUrlImpl(coin);
}

const ICON_OVERRIDES: Record<string, string> = {
  ton: tonAsset.url,
  toncoin: tonAsset.url,
  "the-open-network": tonAsset.url,
};

function coinIconUrlImpl(coin: string) {
  const c = String(coin ?? "").trim().toLowerCase();
  if (!c) return null;
  if (ICON_OVERRIDES[c]) return ICON_OVERRIDES[c];
  return `https://assets.coincap.io/assets/icons/${c}@2x.png`;
}

function chainIconUrl(chain: string) {
  const c = String(chain ?? "").trim().toLowerCase();
  if (!c) return null;
  if (ICON_OVERRIDES[c]) return ICON_OVERRIDES[c];
  const asset = CHAIN_TO_ASSET[c] ?? c;
  if (ICON_OVERRIDES[asset]) return ICON_OVERRIDES[asset];
  return `https://assets.coincap.io/assets/icons/${asset}@2x.png`;
}

function CryptoLogo({ name, iconUrl }: { name: string; iconUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  const letter = String(name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="size-6 shrink-0 rounded-full bg-muted grid place-items-center overflow-hidden text-[10px] font-black">
      {iconUrl && !failed ? (
        <img
          src={iconUrl}
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

function CoinLogo({ coin }: { coin: string }) {
  return <CryptoLogo name={coin} iconUrl={coinIconUrl(coin)} />;
}


function CoinBalanceCard({ coin }: { coin: CoinRow }) {
  const isUsdt = String(coin.coin).toUpperCase() === "USDT";
  return (
    <div dir="ltr" className="relative mx-auto h-[96px] w-full max-w-[190px] shrink-0 rounded-[18px] p-[3px] bg-[radial-gradient(120%_120%_at_50%_0%,oklch(0.55_0.13_170/0.28),transparent_70%)]">
      <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-[15px] bg-[oklch(0.055_0.008_190)] px-3.5 py-2.5 shadow-[0_0_28px_-10px_oklch(0.6_0.14_170/0.35)]">

        <div className="flex items-center justify-between gap-2">
          <div className="text-[26px] font-black leading-none tracking-tight tabular-nums text-white">
            {coin.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>

          {isUsdt ? (
            <img
              src={usdtOfficial.url}
              alt="USDT"
              className="size-[38px] shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="grid size-[38px] shrink-0 place-items-center rounded-full bg-[oklch(0.18_0.03_285)] border border-border/50">
              <CoinLogo coin={coin.coin} />
            </span>
          )}
        </div>

        <div className="mt-2 text-left text-[11px] font-medium text-[oklch(0.72_0.12_170)]">
          USD {coin.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ≈
        </div>
      </div>
    </div>
  );
}


function ChainLogo({ chain }: { chain: string }) {
  return <CryptoLogo name={chain} iconUrl={chainIconUrl(chain)} />;
}

type BybitAccountRow = {
  id: string;
  name: string;
  uid: string | null;
  sortOrder?: number;
  monthlyCashback?: number;
};

export function BybitTab({ isAdmin }: { isAdmin: boolean }) {

  const qc = useQueryClient();
  const listFn = useServerFn(listBybitAccounts);
  const addFn = useServerFn(addBybitAccount);
  const removeFn = useServerFn(removeBybitAccount);
  const updateFn = useServerFn(updateBybitAccount);
  const [selected, setSelected] = usePersistentState<string | null>("bybit_selected_account", null);
  // القسم يفتح على قائمة الحسابات مباشرة (أدمن أو موظف) بدون خطوة ضغط زيادة
  const [listOpen, setListOpen] = usePersistentState<boolean>("bybit_list_open", true);
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<{ message: string; serverIp?: string | null } | null>(null);
  const [editAccount, setEditAccount] = useState<BybitAccountRow | null>(null);

  const accounts = useQuery({ queryKey: ["bybit-accounts"], queryFn: () => listFn() });
  const list = (((accounts.data as any)?.accounts ?? []) as BybitAccountRow[])
    .slice()
    .sort((a, b) => {
      const ao = a.sortOrder && a.sortOrder > 0 ? a.sortOrder : Number.MAX_SAFE_INTEGER;
      const bo = b.sortOrder && b.sortOrder > 0 ? b.sortOrder : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name, "ar");
    });


  // مزامنة معاملات كل الحسابات في الخلفية (مش الحساب المفتوح بس)
  const syncAllFn = useServerFn(syncAllBybitCardTxns);
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current || list.length === 0) return;
    syncedRef.current = true;
    const t = setTimeout(() => {
      void syncAllFn().then(() => {
        qc.invalidateQueries({ queryKey: ["bybit-card"] });
        qc.invalidateQueries({ queryKey: ["bybit-overview"] });
      });
    }, 800);
    return () => clearTimeout(t);
  }, [list.length, qc, syncAllFn]);

  const addAccount = useMutation({
    mutationFn: (data: { apiKey: string; apiSecret: string; name: string; force?: boolean }) => addFn({ data }),
    onSuccess: (res: any) => {
      if (res?.ok === false) {
        setAddError({ message: res.error || "تعذّر ربط الحساب", serverIp: res.serverIp ?? null });
        return;
      }
      setAddError(null);
      toast.success("تمت إضافة الحساب");
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["bybit-accounts"] });
    },
    onError: (e: any) => setAddError({ message: e?.message || "تعذّر ربط الحساب" }),
  });
  const removeAccount = useMutation({
    mutationFn: (data: { id: string }) => removeFn({ data }),
    onSuccess: () => {
      toast.success("تم حذف الحساب");
      qc.invalidateQueries({ queryKey: ["bybit-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل حذف الحساب"),
  });
  const saveAccount = useMutation({
    mutationFn: (data: { id: string; name: string; monthlyCashback: number; sortOrder: number }) => updateFn({ data }),
    onSuccess: () => {
      toast.success("تم حفظ بيانات الحساب");
      setEditAccount(null);
      qc.invalidateQueries({ queryKey: ["bybit-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل حفظ البيانات"),
  });


  const current = list.find((a) => a.id === selected) ?? null;

  useAdminBack(!current && listOpen ? () => setListOpen(false) : null, [!!current, listOpen]);

  if (current) {
    return (
      <BybitAccountView
        isAdmin={isAdmin}
        accountId={current.id}
        accountName={current.name}
        onBack={() => setSelected(null)}
      />
    );
  }

  if (!listOpen) {
    return (
      <div className="space-y-4 text-right" dir="rtl">
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="w-full rounded-2xl border border-border/60 bg-card/60 p-5 text-right transition hover:border-primary/60 hover:bg-card"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="size-10 rounded-xl bg-blue-500/15 text-blue-400 grid place-items-center">
                <Wallet className="size-5" />
              </span>
              <div>
                <div className="text-[11px] text-muted-foreground">
                  {accounts.isLoading ? "جاري التحميل…" : `${list.length} حساب مرتبط`}
                </div>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">فتح ›</span>
          </div>
        </button>
        <BybitLedgerPanel />
      </div>
    );
  }


  return (
    <div className="relative space-y-4 text-right" dir="rtl">
      <FintechBackdrop fullscreen />
      {accounts.isLoading ? (
        <div className="relative z-10 flex justify-center p-10"><Loader2 className="size-6 animate-spin" /></div>
      ) : !list.length ? (
        <div className="relative z-10 rounded-3xl border border-border/60 bg-card/60 p-8 text-center text-sm text-muted-foreground">
          لا توجد حسابات مربوطة بعد{isAdmin ? " — أضف حساباً بمفتاح API (قراءة فقط)." : "."}
        </div>
      ) : (
        <div className="relative z-10 grid auto-rows-[320px] grid-cols-1 gap-4 xl:grid-cols-2">
          {list.map((a, i) => (
            <AccountSummaryCard
              key={a.id}
              account={a}
              index={i}
              isAdmin={isAdmin}
              onOpen={() => setSelected(a.id)}
              onDelete={() => removeAccount.mutate({ id: a.id })}
              onEdit={() => setEditAccount(a)}
            />
          ))}
        </div>
      )}




      <AddAccountDialog
        open={addOpen}
        busy={addAccount.isPending}
        error={addError}
        onClose={() => { setAddOpen(false); setAddError(null); }}
        onSubmit={(d) => addAccount.mutate(d)}
      />

      <EditAccountDialog
        account={editAccount}
        busy={saveAccount.isPending}
        onClose={() => setEditAccount(null)}
        onSubmit={(d) => saveAccount.mutate(d)}
      />

    </div>
  );
}

function AccountSummaryCard({
  account, index, isAdmin, onOpen, onDelete, onEdit,
}: {
  account: BybitAccountRow;
  index: number;
  isAdmin: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const overviewFn = useServerFn(getBybitOverview);
  const q = useQuery({
    queryKey: ["bybit-overview", account.id],
    queryFn: () => overviewFn({ data: { accountId: account.id } }),
    // Balances hit the provider API per card; reuse them for a minute so
    // switching sections does not re-fetch every account each time.
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
  const d = (q.data as any) ?? {};
  const coins = visibleCoins((d.coins ?? []) as CoinRow[]);
  const cashback = Number(account.monthlyCashback ?? 0);
  const visaNo = account.sortOrder && account.sortOrder > 0 ? account.sortOrder : index + 1;

  return (
    <div className="relative flex h-[320px] min-h-[320px] max-h-[320px] flex-col overflow-hidden rounded-[24px] border border-teal-400/25 bg-[oklch(0.16_0.03_190)] p-4 sm:p-5 shadow-[0_0_0_1px_oklch(0.7_0.13_190_/_0.08),0_18px_50px_-24px_oklch(0.6_0.15_190_/_0.45)] transition-shadow hover:shadow-[0_0_0_1px_oklch(0.7_0.13_190_/_0.2),0_22px_60px_-20px_oklch(0.65_0.16_190_/_0.6)]">
      {/* Decorative glow + wave */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 right-1/4 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl" />
        <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="absolute inset-x-0 top-12 h-20 w-full opacity-60">
          <path d="M0 80 C 60 20, 120 110, 200 60 S 340 10, 400 70" fill="none" stroke="oklch(0.75 0.14 190)" strokeOpacity="0.35" strokeWidth="1.5" />
          <path d="M0 95 C 70 45, 140 120, 210 75 S 350 30, 400 88" fill="none" stroke="oklch(0.75 0.14 190)" strokeOpacity="0.18" strokeWidth="1.5" />
        </svg>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col gap-3">
        {/* Top row — identity on right (RTL), gauge on left (visual) */}
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          {/* right cluster (visually): identity + action icons */}
          <div className="flex items-start justify-start gap-2 sm:gap-3">
            <div className="min-w-0 text-right pt-1">
              <div className="flex items-center justify-end gap-1">
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full border border-teal-400/25 bg-teal-400/5 text-teal-300 hover:bg-teal-400/15 hover:text-teal-200"
                      onClick={() => { navigator.clipboard?.writeText(account.uid ?? ""); toast.success("تم نسخ UID"); }}
                      title="نسخ UID"
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={onEdit} title="تعديل">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8 rounded-lg text-destructive" onClick={onDelete} title="حذف">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
                <div className="truncate text-sm font-black">حساب {account.name}</div>
              </div>
              {account.uid && (
                <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground mt-1">
                  <span dir="ltr" className="tabular-nums">UID {account.uid}</span>
                  <button
                    type="button"
                    className="grid size-5 place-items-center rounded-md hover:bg-teal-400/10 hover:text-teal-300"
                    title="نسخ UID"
                    onClick={() => { navigator.clipboard?.writeText(account.uid ?? ""); toast.success("تم نسخ UID"); }}
                  >
                    <Copy className="size-3" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* left cluster: gauge on the left, cashback on the right (matches image-280) */}
          <div dir="ltr" className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center shrink-0">
              <div className="relative grid size-[80px] sm:size-[92px] place-items-center">
                {/* outer tick ring */}
                <div
                  className="absolute inset-0 rounded-full opacity-80"
                  aria-hidden
                  style={{
                    background:
                      "repeating-conic-gradient(from 0deg, oklch(0.78 0.14 190) 0deg 0.8deg, transparent 0.8deg 10deg)",
                    WebkitMask: "radial-gradient(closest-side, transparent 78%, #000 79%, #000 92%, transparent 93%)",
                    mask: "radial-gradient(closest-side, transparent 78%, #000 79%, #000 92%, transparent 93%)",
                  }}
                />
                {/* thin outer circle */}
                <div className="absolute inset-[4px] rounded-full border border-teal-400/25" aria-hidden />
                {/* glowing main ring */}
                <div className="absolute inset-[10px] rounded-full border-[3px] border-teal-400 shadow-[0_0_26px_-2px_oklch(0.75_0.15_190_/_0.85),inset_0_0_22px_-6px_oklch(0.75_0.15_190_/_0.9)]" aria-hidden />
                <span className="relative text-3xl sm:text-4xl font-black text-teal-300 tabular-nums" dir="ltr">{visaNo}</span>
              </div>
            </div>

            {/* vertical dashed divider */}
            <div className="h-14 sm:h-16 w-0 border-r border-dashed border-teal-400/45" aria-hidden />

            <div className="flex flex-col items-end gap-1 pt-1">
              <div className="flex items-center gap-2">
                <PieChart className="size-4 text-teal-400 shrink-0" />
                <span className="text-sm text-foreground/90 whitespace-nowrap text-right">استرداد بنسبة</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-teal-300 tabular-nums leading-none" dir="ltr">
                {cashback.toLocaleString("en-US", { maximumFractionDigits: 2 })}%
              </div>
            </div>
          </div>
        </div>

        {/* Balances — bottom right aligned, lowered and slightly larger */}
        <div className="ml-auto mt-auto h-[96px] min-h-[96px] max-h-[96px] w-full max-w-[190px] shrink-0 overflow-hidden">
          {q.isLoading ? (
            <div className="relative h-full w-full rounded-[18px] p-[3px] bg-[radial-gradient(120%_120%_at_50%_0%,oklch(0.55_0.13_170/0.28),transparent_70%)]">
              <div className="grid h-full w-full place-items-center rounded-[15px] bg-[oklch(0.055_0.008_190)] shadow-[0_0_28px_-10px_oklch(0.6_0.14_170/0.35)]">
                <Loader2 className="size-5 animate-spin" />
              </div>
            </div>
          ) : (
            <div className="h-full w-full overflow-hidden">
              {coins.map((c) => (
                <CoinBalanceCard key={c.coin} coin={c} />
              ))}
            </div>
          )}
        </div>

        {d.failed ? (
          <div className="shrink-0 rounded-xl border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive-foreground line-clamp-2">
            تعذّر جلب البيانات: {String(d.failed)}
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="mt-auto flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-teal-400/35 bg-[linear-gradient(135deg,oklch(0.32_0.08_190),oklch(0.22_0.06_190))] px-4 py-3 text-sm font-bold text-teal-100 shadow-[0_0_20px_-10px_oklch(0.7_0.15_190_/_0.8)] transition-all hover:border-teal-300/60 hover:brightness-125 hover:shadow-[0_0_28px_-8px_oklch(0.72_0.16_190_/_0.9)]"
          >
            <BarChart3 className="size-4 text-teal-300" />
            عرض بيانات الحساب
          </button>
        )}
      </div>
    </div>
  );
}


function validateBybitCreds({ name, apiKey, apiSecret }: { name: string; apiKey: string; apiSecret: string }) {
  const e: { name?: string; apiKey?: string; apiSecret?: string } = {};
  const n = name.trim();
  const k = apiKey.trim();
  const sec = apiSecret.trim();
  if (n.length > 60) e.name = "اسم الحساب لازم يكون أقل من 60 حرف";
  if (!k) e.apiKey = "أدخل API Key";
  else if (k.length < 8 || k.length > 200) e.apiKey = "مفتاح API غير صالح (من 8 إلى 200 حرف)";
  else if (!/^[A-Za-z0-9_-]+$/.test(k)) e.apiKey = "مفتاح API يحتوي على رموز غير مسموحة";
  if (!sec) e.apiSecret = "أدخل API Secret";
  else if (sec.length < 8 || sec.length > 400) e.apiSecret = "السر غير صالح (من 8 إلى 400 حرف)";
  else if (!/^[A-Za-z0-9_-]+$/.test(sec)) e.apiSecret = "السر يحتوي على رموز غير مسموحة";
  return e;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground block">{label}</label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function AddAccountDialog({
  open, onClose, onSubmit, busy, error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (d: { apiKey: string; apiSecret: string; name: string; force?: boolean }) => void;
  busy: boolean;
  error?: { message: string; serverIp?: string | null } | null;
}) {
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [errors, setErrors] = useState<{ name?: string; apiKey?: string; apiSecret?: string }>({});
  useEffect(() => {
    if (!open) { setName(""); setApiKey(""); setApiSecret(""); setErrors({}); }
  }, [open]);

  function submit(force = false) {
    const e = validateBybitCreds({ name, apiKey, apiSecret });
    setErrors(e);
    if (Object.keys(e).length) return;
    onSubmit({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), name: name.trim(), force });
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة حساب Bybit</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="اسم الحساب" error={errors.name}>
            <Input placeholder="مثال: حساب الشركة الرئيسي" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="API Key" error={errors.apiKey}>
            <Input dir="ltr" placeholder="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </Field>
          <Field label="API Secret" error={errors.apiSecret}>
            <Input dir="ltr" placeholder="API Secret" type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
          </Field>
          <p className="text-[11px] text-muted-foreground">لو سِبت الاسم فاضي هيتجاب أوتوماتيك من Bybit بعد التحقق من المفتاح.</p>
          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 space-y-2 text-[11px] text-destructive">
              <div>{error.message}</div>
              {error.serverIp && (
                <div className="text-muted-foreground" dir="ltr">
                  Server IP: {error.serverIp}
                </div>
              )}
              <div className="text-muted-foreground">
                تقدر تحفظ الحساب برضه وتصلّح صلاحيات المفتاح من Bybit بعدين.
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full rounded-xl"
                disabled={busy}
                onClick={() => submit(true)}
              >
                {busy ? <Loader2 className="size-4 ml-1 animate-spin" /> : null} احفظ الحساب رغم التحذير
              </Button>
            </div>
          )}
          <Button className="w-full rounded-xl" disabled={busy} onClick={() => submit(false)}>
            {busy ? <Loader2 className="size-4 ml-1 animate-spin" /> : null} ربط الحساب
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditAccountDialog({
  account, onClose, onSubmit, busy,
}: {
  account: BybitAccountRow | null;
  onClose: () => void;
  onSubmit: (d: { id: string; name: string; monthlyCashback: number; sortOrder: number }) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [cashback, setCashback] = useState("0");
  const [order, setOrder] = useState("1");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account) {
      setName(account.name ?? "");
      setCashback(String(account.monthlyCashback ?? 0));
      setOrder(String(account.sortOrder ?? 1));
      setError(null);
    }
  }, [account]);

  function submit() {
    if (!account) return;
    const n = name.trim();
    if (!n) return setError("اسم الحساب مطلوب");
    const c = Number(cashback);
    if (!Number.isFinite(c) || c < 0 || c > 100) return setError("نسبة الاسترداد لازم تكون بين 0 و 100");
    const o = Math.trunc(Number(order));
    if (!Number.isFinite(o) || o < 1 || o > 9999) return setError("رقم الفيزا لازم يكون بين 1 و 9999");
    setError(null);
    onSubmit({ id: account.id, name: n.slice(0, 60), monthlyCashback: c, sortOrder: o });
  }

  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل بيانات الفيزا</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="رقم الفيزا">
            <Input
              dir="ltr"
              type="number"
              min={1}
              max={9999}
              step="1"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            />
          </Field>
          <Field label="اسم الحساب">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="الاسترداد الشهري (%)">
            <Input
              dir="ltr"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={cashback}
              onChange={(e) => setCashback(e.target.value)}
            />
          </Field>
          {account?.uid && (
            <p className="text-[11px] text-muted-foreground" dir="ltr">UID {account.uid}</p>
          )}
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          <Button className="w-full rounded-xl" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="size-4 ml-1 animate-spin" /> : null} حفظ التعديلات
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


function BybitAccountView({ isAdmin, accountId, accountName, onBack }: { isAdmin: boolean; accountId: string; accountName: string; onBack: () => void }) {
  const qc = useQueryClient();
  // الموظف يشاهد كل بيانات القسم (قراءة فقط). الأدوات الخاصة بالأدمن
  // (إضافة/حذف حساب، مفاتيح API، التحويل، تعديل البطاقات وبيانات الحساب)
  // محكومة بـ isAdmin في مكانها.
  const show = (_k: "balance" | "spend" | "txns" | "onchain" | "internal" | "cards" | "account" | "docs") => true;
  const [tab, setTab] = useState<"card" | "onchain" | "internal" | "p2p">("card");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(TAB_KEY) : null;
    if (saved === "card" || saved === "onchain" || saved === "internal" || saved === "p2p") setTab(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  const overviewFn = useServerFn(getBybitOverview);
  const cardFn = useServerFn(getBybitCardTxns);
  const syncCardFn = useServerFn(syncBybitCardTxns);
  const cardsFn = useServerFn(getBybitCards);
  const [cardsOpen, setCardsOpen] = useState(false);
  useAdminBack(cardsOpen ? () => setCardsOpen(false) : onBack, [cardsOpen, onBack]);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const chainFn = useServerFn(getBybitOnChain);
  const internalFn = useServerFn(getBybitInternal);
  const p2pFn = useServerFn(getBybitP2P);
  const createCardFn = useServerFn(createBybitCard);
  const deleteCardFn = useServerFn(deleteBybitCard);
  const updateCardFn = useServerFn(updateBybitCard);
  const [editCard, setEditCard] = useState<any | null>(null);

  const overview = useQuery({ queryKey: ["bybit-overview", accountId], queryFn: () => overviewFn({ data: { accountId } }) });
  const card = useQuery({
    queryKey: ["bybit-card", accountId],
    queryFn: () => cardFn({ data: { accountId, page: 1, pageSize: 10 } }),
    enabled: tab === "card",
    staleTime: 30_000,
  });
  const chain = useQuery({ queryKey: ["bybit-chain", accountId], queryFn: () => chainFn({ data: { accountId } }), enabled: tab === "onchain" });
  const internal = useQuery({ queryKey: ["bybit-internal", accountId], queryFn: () => internalFn({ data: { accountId } }), enabled: tab === "internal" });
  const p2p = useQuery({ queryKey: ["bybit-p2p", accountId], queryFn: () => p2pFn({ data: { accountId } }), enabled: tab === "p2p" });
  const cards = useQuery({ queryKey: ["bybit-cards", accountId], queryFn: () => cardsFn({ data: { accountId } }), enabled: cardsOpen });

  useEffect(() => {
    if (tab !== "card" || card.isLoading || card.isError) return;
    let active = true;
    let timer: number | undefined;

    const syncUntilOldestPage = async () => {
      if (!active) return;
      try {
        const result = await syncCardFn({ data: { accountId } });
        if (!active) return;
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["bybit-card", accountId] }),
          qc.invalidateQueries({ queryKey: ["bybit-overview", accountId] }),
          qc.invalidateQueries({ queryKey: ["bybit-cards", accountId] }),
        ]);
        if (!(result as any)?.backfillDone) {
          timer = window.setTimeout(() => void syncUntilOldestPage(), 1_000);
        }
      } catch {
        if (active) timer = window.setTimeout(() => void syncUntilOldestPage(), 5_000);
      }
    };

    timer = window.setTimeout(() => void syncUntilOldestPage(), 2_000);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [accountId, card.isError, card.isLoading, qc, syncCardFn, tab]);

  const createCard = useMutation({
    mutationFn: (data: { pan4: string; brand: string; currency: string; status: string; name?: string; fullNumber?: string; cvv?: string; expiry?: string }) =>
      createCardFn({ data: { ...data, accountId } }),
    onSuccess: () => {
      toast.success("تمت إضافة البطاقة");
      setAddCardOpen(false);
      qc.invalidateQueries({ queryKey: ["bybit-cards", accountId] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل إضافة البطاقة"),
  });
  const updateCard = useMutation({
    mutationFn: (data: any) => updateCardFn({ data }),
    onSuccess: () => {
      toast.success("تم تحديث البطاقة");
      setEditCard(null);
      qc.invalidateQueries({ queryKey: ["bybit-cards", accountId] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل تعديل البطاقة"),
  });
  const deleteCard = useMutation({
    mutationFn: (data: { id: string }) => deleteCardFn({ data }),
    onSuccess: () => {
      toast.success("تم حذف البطاقة");
      qc.invalidateQueries({ queryKey: ["bybit-cards", accountId] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل حذف البطاقة"),
  });

  const configured = (overview.data as any)?.configured !== false;
  const failed = (overview.data as any)?.failed as string | undefined;
  const partialErrors = ((overview.data as any)?.errors ?? []) as string[];
  const coinBalances = visibleCoins(((overview.data as any)?.coins ?? []) as CoinRow[]);
  const monthSpend = (overview.data as any)?.monthSpend ?? 0;
  const daySpend = (overview.data as any)?.daySpend ?? 0;
  const monthFees = Number((overview.data as any)?.monthFees ?? 0);
  const dayFees = Number((overview.data as any)?.dayFees ?? 0);

  


  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["bybit-overview", accountId] });
    qc.invalidateQueries({ queryKey: ["bybit-card", accountId] });
    qc.invalidateQueries({ queryKey: ["bybit-chain", accountId] });
    qc.invalidateQueries({ queryKey: ["bybit-internal", accountId] });
  }

  return (
    <div className="space-y-4 text-right" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {cardsOpen && <h2 className="text-sm font-bold">بطاقاتي</h2>}
        </div>
        {!cardsOpen && (
          <div className="flex items-center gap-2">
            {show("cards") && (
              <Button variant="secondary" size="sm" className="rounded-xl" onClick={() => setCardsOpen(true)}>
                <CreditCard className="size-4 ml-1" />بطاقة
              </Button>
            )}
            <Button variant="outline" size="icon" className="rounded-xl" onClick={refreshAll}>
              <RefreshCw className={`size-4 ${overview.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        )}
      </div>
      {cardsOpen ? (
        <>
          <CardsPanel q={cards} isAdmin={isAdmin} onAdd={() => setAddCardOpen(true)} onDelete={(id) => deleteCard.mutate({ id })} onEdit={(c) => setEditCard(c)} />
          {show("account") && <AccountInfoCard isAdmin={isAdmin} accountId={accountId} />}
          <BybitDocsCard isAdmin={isAdmin} accountId={accountId} />
          <AddCardDialog
            open={addCardOpen}
            onClose={() => setAddCardOpen(false)}
            onSubmit={(data) => createCard.mutate(data)}
            busy={createCard.isPending}
          />
          <AddCardDialog
            open={Boolean(editCard)}
            card={editCard}
            onClose={() => setEditCard(null)}
            onSubmit={(data) => updateCard.mutate({ ...data, id: editCard?.id })}
            busy={updateCard.isPending}
          />
        </>
      ) : (
      <>
      {!configured && !isAdmin && (
        <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-sm text-muted-foreground">
          لم يتم ربط حساب Bybit بعد — مطلوب مفتاح API (قراءة فقط) لعرض الرصيد والمعاملات.
        </div>
      )}
      {failed && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive-foreground">
          تعذّر جلب البيانات من Bybit: {failed}
        </div>
      )}
      {!failed && partialErrors.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-400" dir="ltr">
          {partialErrors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      {/* Balance cards */}
      {show("balance") && (
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
          <div className="flex flex-wrap items-stretch gap-3">
            {coinBalances.map((c) => (
              <div
                key={c.coin}
                className="rounded-xl border border-border/60 bg-background/60 p-3 inline-flex items-center gap-3"
              >
                <CoinLogo coin={c.coin} />
                <div>
                  <div className="text-[11px] text-muted-foreground mb-0.5">{c.coin}</div>
                  <div className="text-3xl font-black tracking-tight tabular-nums">
                    {c.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">≈ {money(c.usd)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spending stats inside account detail */}

      {show("spend") && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-border/60 bg-card/70 p-3">
            <div className="text-xs font-bold text-muted-foreground mb-2 px-1">الإنفاق</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="الإنفاق الشهري" value={`$${monthSpend.toFixed(2)}`} />
              <Stat label="الإنفاق اليومي" value={`$${daySpend.toFixed(2)}`} />
            </div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/70 p-3">
            <div className="text-xs font-bold text-muted-foreground mb-2 px-1">رسوم الفيزا</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="رسوم الفيزا الشهرية" value={`$${monthFees.toFixed(2)}`} />
              <Stat label="رسوم الفيزا اليومية" value={`$${dayFees.toFixed(2)}`} />
            </div>
          </div>
        </div>
      )}



      {/* Tabs */}
      <div className="flex items-center justify-start gap-2">
        {show("txns") && <Chip active={tab === "card"} onClick={() => setTab("card")}>المعاملات</Chip>}
        {show("onchain") && <Chip active={tab === "onchain"} onClick={() => setTab("onchain")}>السحب والإيداع الخارجي</Chip>}
        {show("internal") && <Chip active={tab === "internal"} onClick={() => setTab("internal")}>السحب والإيداع الداخلي</Chip>}
        {show("txns") && <Chip active={tab === "p2p"} onClick={() => setTab("p2p")}>طلبات P2P</Chip>}
      </div>

      {tab === "card" && show("txns") && <CardTable q={card} accountId={accountId} />}
      {tab === "onchain" && show("onchain") && <AssetTable q={chain} title="" icon inChip="الاستلام" outChip="التحويل على السلسلة" showAddress={false} hideFeeOnDeposit />}
      {tab === "internal" && show("internal") && <AssetTable q={internal} title="" inChip="إيداع" outChip="سحب" showAddress hideChain />}
      {tab === "p2p" && show("txns") && <P2PTable q={p2p} />}
      </>
      )}
    </div>
  );
}

/** يحدد نوع البطاقة تلقائيًا من رقمها */
function detectBrand(input: string): string | null {
  const n = String(input || "").replace(/\D/g, "");
  if (!n) return null;
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return "MasterCard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(62|81)/.test(n)) return "UnionPay";
  if (/^35/.test(n)) return "JCB";
  if (/^(6011|64[4-9]|65)/.test(n)) return "Discover";
  if (/^3(0[0-5]|[68])/.test(n)) return "Diners";
  if (/^(50|5[6-9]|6)/.test(n)) return "Maestro";
  return null;
}

/** ألوان/تدرّج البطاقة حسب نوعها */
function brandTheme(brand: string) {
  const b = (brand || "").toLowerCase();
  if (b.includes("master"))
    return { bg: "linear-gradient(135deg,#241014 0%,#3a1218 55%,#0a0507 100%)", border: "rgba(235,0,27,0.28)" };
  if (b.includes("amex") || b.includes("express"))
    return { bg: "linear-gradient(135deg,#062b3a 0%,#0b4b63 55%,#04161d 100%)", border: "rgba(0,175,235,0.3)" };
  if (b.includes("union"))
    return { bg: "linear-gradient(135deg,#0d1b2c 0%,#2a1116 55%,#05080d 100%)", border: "rgba(224,32,50,0.28)" };
  if (b.includes("jcb"))
    return { bg: "linear-gradient(135deg,#12111f 0%,#241733 55%,#07060c 100%)", border: "rgba(120,60,200,0.3)" };
  if (b.includes("discover"))
    return { bg: "linear-gradient(135deg,#1d1408 0%,#31200a 55%,#0a0703 100%)", border: "rgba(255,96,0,0.3)" };
  if (b.includes("diners"))
    return { bg: "linear-gradient(135deg,#0a1526 0%,#122744 55%,#04070c 100%)", border: "rgba(0,121,190,0.3)" };
  if (b.includes("maestro"))
    return { bg: "linear-gradient(135deg,#0a1524 0%,#1a1030 55%,#05070a 100%)", border: "rgba(0,160,223,0.28)" };
  return { bg: "linear-gradient(135deg,#0b1424 0%,#101a2e 55%,#05070a 100%)", border: "rgba(20,52,203,0.35)" };
}

const CARD_BRANDS = ["Visa", "MasterCard", "Amex", "UnionPay", "JCB", "Discover", "Diners", "Maestro"] as const;

function BrandBadge({ brand }: { brand: string }) {
  const b = (brand || "").toLowerCase();
  if (b.includes("master") || b.includes("maestro"))
    return (
      <span className="inline-flex items-center justify-center rounded-md bg-black/60 px-1.5 py-1">
        <span className="relative block h-2.5 w-5">
          <span className={`absolute left-0 top-0 size-2.5 rounded-full ${b.includes("maestro") ? "bg-[#0099df]" : "bg-[#eb001b]"}`} />
          <span className={`absolute right-0 top-0 size-2.5 rounded-full opacity-90 ${b.includes("maestro") ? "bg-[#ed0006]" : "bg-[#f79e1b]"}`} />
        </span>
      </span>
    );
  if (b.includes("amex") || b.includes("express"))
    return <span className="rounded-md bg-[#016fd0] px-2 py-1 text-[8px] font-black tracking-wider text-white">AMEX</span>;
  if (b.includes("union"))
    return <span className="rounded-md bg-[#e02032] px-2 py-1 text-[8px] font-black tracking-wider text-white">UnionPay</span>;
  if (b.includes("jcb"))
    return <span className="rounded-md bg-[#0e4c96] px-2 py-1 text-[8px] font-black tracking-wider text-white">JCB</span>;
  if (b.includes("discover"))
    return <span className="rounded-md bg-[#ff6000] px-2 py-1 text-[8px] font-black tracking-wider text-white">DISCOVER</span>;
  if (b.includes("diners"))
    return <span className="rounded-md bg-[#0079be] px-2 py-1 text-[8px] font-black tracking-wider text-white">DINERS</span>;
  return (
    <span className="rounded-md bg-[#1434cb] px-2 py-1 text-[8px] font-black italic tracking-wider text-white">
      VISA
    </span>
  );
}

function RealChip() {
  return (
    <svg viewBox="0 0 40 30" className="h-[25px] w-[34px] drop-shadow-md">
      <defs>
        <linearGradient id="chipGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f7d47a" />
          <stop offset="25%" stopColor="#c79a3b" />
          <stop offset="50%" stopColor="#f3dc9a" />
          <stop offset="75%" stopColor="#b5852f" />
          <stop offset="100%" stopColor="#e6c168" />
        </linearGradient>
        <linearGradient id="padGold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e6c168" />
          <stop offset="100%" stopColor="#b5852f" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="28" rx="4" fill="url(#chipGold)" stroke="#9a7225" strokeWidth="0.8" />
      <rect x="5" y="5" width="7" height="7" rx="1.2" fill="url(#padGold)" stroke="#9a7225" strokeWidth="0.4" />
      <rect x="16" y="5" width="8" height="7" rx="1.2" fill="url(#padGold)" stroke="#9a7225" strokeWidth="0.4" />
      <rect x="28" y="5" width="7" height="7" rx="1.2" fill="url(#padGold)" stroke="#9a7225" strokeWidth="0.4" />
      <rect x="5" y="18" width="7" height="7" rx="1.2" fill="url(#padGold)" stroke="#9a7225" strokeWidth="0.4" />
      <rect x="16" y="18" width="8" height="7" rx="1.2" fill="url(#padGold)" stroke="#9a7225" strokeWidth="0.4" />
      <rect x="28" y="18" width="7" height="7" rx="1.2" fill="url(#padGold)" stroke="#9a7225" strokeWidth="0.4" />
      <line x1="12.5" y1="8.5" x2="16" y2="8.5" stroke="#9a7225" strokeWidth="0.5" />
      <line x1="24" y1="8.5" x2="27.5" y2="8.5" stroke="#9a7225" strokeWidth="0.5" />
      <line x1="12.5" y1="21.5" x2="16" y2="21.5" stroke="#9a7225" strokeWidth="0.5" />
      <line x1="24" y1="21.5" x2="27.5" y2="21.5" stroke="#9a7225" strokeWidth="0.5" />
      <line x1="20" y1="12" x2="20" y2="18" stroke="#9a7225" strokeWidth="0.5" />
    </svg>
  );
}

function BybitCardArt({ c, onDelete, canDelete = true, onEdit }: { c: any; onDelete?: () => void; canDelete?: boolean; onEdit?: () => void }) {
  const name = c.name || `بطاقة ${c.brand || "Visa"}`;
  const raw = String(c.fullNumber || "").replace(/\D/g, "");
  const brand = detectBrand(raw) || c.brand || "Visa";
  const theme = brandTheme(brand);
  const number = raw
    ? raw.replace(/(.{4})/g, "$1 ").trim()
    : `**** **** **** ${c.pan4 ?? ""}`.trim();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [hideCvv, setHideCvv] = useState(false);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`تم نسخ ${label}`);
    } catch {
      toast.error("تعذر النسخ");
    }
  };

  const handleDownload = async () => {
    setHideCvv(true);
    await new Promise((r) => setTimeout(r, 60));
    try {
      const { toPng } = await import("html-to-image");
      if (cardRef.current) {
        const dataUrl = await toPng(cardRef.current, { pixelRatio: 3, cacheBust: true });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `card-${c.pan4 || "bybit"}.png`;
        a.click();
      }
    } finally {
      setHideCvv(false);
    }
  };

  return (
    <div className="relative w-full max-w-[260px]">
      {/* controls above the card */}
      <div className="mb-1.5 flex items-center justify-end gap-1.5">
        <span className="rounded-md bg-[#f7a600] px-1.5 py-0.5 text-[9px] font-black text-black">Active</span>
        <button
          type="button"
          onClick={handleDownload}
          className="rounded-md bg-black/40 p-1 text-white/70 transition-colors hover:text-sky-400"
          title="تحميل صورة البطاقة"
        >
          <Download className="size-3.5" />
        </button>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md bg-black/40 p-1 text-white/70 transition-colors hover:text-sky-400"
            title="تعديل بيانات البطاقة"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md bg-black/40 p-1 text-white/70 transition-colors hover:text-destructive"
            title="حذف"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      <div
        ref={cardRef}
        dir="ltr"
        style={{ backgroundImage: theme.bg, borderColor: theme.border }}
        className="relative aspect-[85.6/53.98] w-full overflow-hidden rounded-[12px] border shadow-[0_10px_24px_-10px_rgba(0,0,0,0.9)]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_85%_0%,rgba(255,255,255,0.08),transparent_60%)]" />

        {/* top row */}
        <div className="absolute inset-x-[5%] top-[6%] flex items-start justify-between">
          <span className="text-[9px] uppercase tracking-[0.16em] text-white/50">
            {c.virtual === false ? "Physical" : "Virtual"}
          </span>
          <span className="text-[13px] font-black leading-none tracking-tight text-white">
            BYB<span className="text-[#f7a600]">I</span>T
          </span>
        </div>

        {/* chip + contactless */}
        <div className="absolute left-[5%] top-[26%] flex items-center gap-2">
          <RealChip />
          <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] text-white/60" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8 8a6 6 0 0 1 0 8" />
            <path d="M12 5a10 10 0 0 1 0 14" />
            <path d="M16 2.5a14 14 0 0 1 0 19" />
          </svg>
        </div>

        {/* card number under chip */}
        <div className="absolute left-[5%] top-[50%] flex items-center gap-1.5">
          <span className="whitespace-nowrap text-left text-[13px] font-semibold tracking-[0.12em] tabular-nums text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
            {number}
          </span>
          {!hideCvv && (
            <button
              type="button"
              onClick={() => copy(raw || String(c.pan4 ?? ""), "رقم البطاقة")}
              className="rounded-md p-0.5 text-white/50 transition-colors hover:text-white"
              title="نسخ رقم البطاقة"
            >
              <Copy className="size-3" />
            </button>
          )}
        </div>

        {/* expiry + cvv row */}
        <div className="absolute inset-x-[5%] top-[64%] flex items-center gap-3">
          <div>
            <div className="text-[7px] uppercase tracking-wider text-white/45">Expires</div>
            <div className="text-[10px] font-bold tabular-nums text-white">{c.expiry || "—"}</div>
          </div>
          {!hideCvv && (
            <div>
              <div className="text-[7px] uppercase tracking-wider text-white/45">CVV</div>
              <div className="text-[10px] font-bold tabular-nums text-white">{c.cvv || "—"}</div>
            </div>
          )}
        </div>

        {/* cardholder name */}
        <div className="absolute inset-x-[5%] bottom-[6%] flex items-end justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-white/85">{name}</div>
            {!hideCvv && (
              <button
                type="button"
                onClick={() => copy(name, "اسم صاحب البطاقة")}
                className="shrink-0 rounded-md p-0.5 text-white/50 transition-colors hover:text-white"
                title="نسخ الاسم"
              >
                <Copy className="size-3" />
              </button>
            )}
          </div>
          <BrandBadge brand={brand} />
        </div>

      </div>
    </div>
  );
}

function CardsPanel({ q, isAdmin, onAdd, onDelete, onEdit }: { q: any; isAdmin: boolean; onAdd: () => void; onDelete: (id: string) => void; onEdit?: (c: any) => void }) {
  const list = ((q.data as any)?.cards ?? []) as any[];
  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">بطاقاتي</h2>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={onAdd}>
              <Plus className="size-4 ml-1" /> إضافة بطاقة
            </Button>
          </div>
        )}
      </div>
      {q.isLoading ? (
        <div className="flex justify-center p-6">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2">
          {list.map((c) => (
            <BybitCardArt key={c.id || c.pan4} c={c} canDelete={isAdmin} onDelete={() => c.id && onDelete(c.id)} onEdit={isAdmin && c.id ? () => onEdit?.(c) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountInfoCard({ isAdmin, accountId }: { isAdmin: boolean; accountId?: string }) {
  const load = useServerFn(getBybitAccountInfo);
  const save = useServerFn(saveBybitAccountInfo);
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: ["bybit-account-info", accountId ?? null],
    queryFn: () => load({ data: { accountId } } as any),
  });
  const row = (info.data as any)?.info ?? null;
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ email: "", phone: "", password: "", bonus: "", mfa_code: "" });

  useEffect(() => {
    setForm({
      email: row?.email ?? "", phone: row?.phone ?? "", password: row?.password ?? "",
      bonus: row?.bonus ?? "", mfa_code: row?.mfa_code ?? "",
    });
  }, [row]);

  const m = useMutation({
    mutationFn: () => save({ data: { id: row?.id, accountId, ...form } } as any),
    onSuccess: () => {
      toast.success("تم الحفظ");
      setEdit(false);
      qc.invalidateQueries({ queryKey: ["bybit-account-info", accountId ?? null] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const fields: Array<{ key: keyof typeof form; label: string }> = [
    { key: "email", label: "البريد" },
    { key: "phone", label: "رقم التلفون" },
    { key: "password", label: "الباسورد" },
    { key: "bonus", label: "المكافأة" },
    { key: "mfa_code", label: "رمز المصادقة" },
  ];

  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">بيانات الحساب</h3>
        {!isAdmin ? null : edit ? (
          <div className="flex gap-2">
            <Button size="sm" className="rounded-xl" onClick={() => m.mutate()} disabled={m.isPending}>
              {m.isPending ? <Loader2 className="size-4 animate-spin" /> : "حفظ"}
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEdit(false)}>إلغاء</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEdit(true)}>تعديل</Button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1.5 rounded-2xl border border-border/60 bg-background/40 p-3">
            <span className="text-xs text-muted-foreground">{f.label}</span>
            {edit ? (
              <Input
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                className="h-9 rounded-xl border-border/60 bg-background/60 text-right"
              />
            ) : (
              <span className="truncate text-sm font-semibold">{form[f.key] || "—"}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AddCardDialog({ open, onClose, onSubmit, busy, card }: {
  open: boolean;
  card?: any;
  onClose: () => void;
  onSubmit: (data: { pan4: string; brand: string; currency: string; status: string; name: string; fullNumber: string; cvv: string; expiry: string }) => void;
  busy: boolean;
}) {
  const initial = { name: "", pan4: "", fullNumber: "", brand: "Visa", currency: "USD", status: "active", cvv: "", expiry: "", kind: "virtual" };
  const [form, setForm] = useState(initial);
  useEffect(() => {
    if (!open) { setForm(initial); return; }
    if (card) {
      setForm({
        name: card.name ?? "",
        pan4: card.pan4 ?? "",
        fullNumber: card.fullNumber ?? "",
        brand: card.brand ?? "Visa",
        currency: card.currency ?? "USD",
        status: card.status ?? "active",
        cvv: card.cvv ?? "",
        expiry: card.expiry ?? "",
        kind: card.virtual === false ? "physical" : "virtual",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, card]);
  const field = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((s) => {
        const next = { ...s, [k]: e.target.value };
        if (k === "fullNumber") {
          const auto = detectBrand(e.target.value);
          if (auto) next.brand = auto;
        }
        return next;
      }),
  });
  const setBrand = (brand: string) => setForm((s) => ({ ...s, brand }));
  const copy = (v: string) => navigator.clipboard?.writeText(v || "");
  const inputCls =
    "rounded-xl bg-transparent border-border/60 h-12 text-right placeholder:text-muted-foreground/50";
  const pick = (active: boolean) =>
    `h-12 flex-1 rounded-xl border text-sm font-bold transition-colors ${
      active
        ? "border-[#f7a600] text-[#f7a600] bg-transparent"
        : "border-border/60 text-foreground/80 bg-transparent hover:border-border"
    }`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg rounded-2xl bg-[#0f1013] border-border/50" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right text-xl font-bold">{card ? "تعديل الكرت" : "كرت جديد"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-1 text-right">
          <div className="grid gap-2">
            <label className="text-sm text-muted-foreground">اسم صاحب البطاقة</label>
            <Input placeholder="مثال: أحمد محمد" {...field("name")} className={inputCls} />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => copy(form.fullNumber)} className="text-sm text-[#f7a600] hover:underline">نسخ</button>
              <label className="text-sm text-muted-foreground">رقم البطاقة</label>
            </div>
            <Input placeholder="5596 1234 5678 4938" {...field("fullNumber")} className={inputCls} dir="ltr" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => copy(form.cvv)} className="text-sm text-[#f7a600] hover:underline">نسخ</button>
                <label className="text-sm text-muted-foreground">رمز CVV</label>
              </div>
              <Input placeholder="123" {...field("cvv")} className={inputCls} dir="ltr" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">تاريخ الانتهاء</label>
              <Input placeholder="07/29" {...field("expiry")} className={inputCls} dir="ltr" />
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm text-muted-foreground">النوع</label>
            <div className="flex gap-3">
              <button type="button" onClick={() => setForm((s) => ({ ...s, kind: "virtual" }))} className={pick(form.kind === "virtual")}>
                افتراضية
              </button>
              <button type="button" onClick={() => setForm((s) => ({ ...s, kind: "physical" }))} className={pick(form.kind === "physical")}>
                فعلية
              </button>
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm text-muted-foreground">الأيقونة</label>
            <p className="text-[11px] text-muted-foreground/70">يتم التعرف على النوع تلقائيًا من رقم البطاقة، ويمكنك تغييره يدويًا.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CARD_BRANDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBrand(b)}
                  className={`${pick(form.brand === b)} inline-flex items-center justify-center gap-2 px-2`}
                >
                  <span className="text-xs">{b}</span>
                  <BrandBadge brand={b} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <Button
              disabled={busy}
              onClick={() =>
                onSubmit({
                  ...form,
                  pan4: form.pan4 || form.fullNumber.replace(/\D/g, "").slice(-4),
                })
              }
              className="rounded-xl h-11 px-7 bg-muted text-foreground hover:bg-muted/80 font-bold"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : card ? "حفظ" : "إضافة"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CardTable({ q, accountId }: { q: any; accountId?: string }) {
  const cardsFn = useServerFn(getBybitCards);
  const cards = useQuery({
    queryKey: ["bybit-cards", accountId],
    queryFn: () => cardsFn({ data: { accountId } }),
  });
  const brandByPan4: Record<string, string> = {};
  for (const c of ((cards.data as any)?.cards ?? []) as any[]) {
    const pan4 = String(c?.pan4 ?? "").trim();
    if (!pan4) continue;
    brandByPan4[pan4] = detectBrand(String(c?.fullNumber ?? "")) || String(c?.brand ?? "Visa");
  }
  return <CardTableInner brandByPan4={brandByPan4} accountId={accountId} />;
}

function P2PTable({ q }: { q: any }) {
  const [side, setSide] = usePersistentState<"all" | "buy" | "sell">("bybit.p2p.side", "buy");
  const rows: any[] = (q.data?.rows ?? []).filter((r: any) => r.status !== "pending");
  const shown = rows.filter((r) => (side === "all" ? true : r.side === side));

  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 overflow-hidden">
      <div className="flex items-center justify-start gap-1 p-4">
        <Chip active={side === "buy"} onClick={() => setSide("buy")}>شراء</Chip>
        <Chip active={side === "sell"} onClick={() => setSide("sell")}>بيع</Chip>
        <Chip active={side === "all"} onClick={() => setSide("all")}>الجميع</Chip>
      </div>
      {q.isLoading ? (
        <Empty text="جارٍ التحميل…" />
      ) : q.data?.failed ? (
        <div className="p-6 text-center text-xs text-destructive" dir="ltr">{String(q.data.failed)}</div>
      ) : !shown.length ? (
        <Empty text="لا توجد طلبات P2P" />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="p-4 text-right font-normal">النوع / التاريخ</th>
                <th className="p-4 text-right font-normal">رقم الطلب</th>
                <th className="p-4 text-right font-normal">السعر</th>
                <th className="p-4 text-right font-normal">المبلغ / الكمية</th>
                <th className="p-4 text-right font-normal">الطرف المقابل</th>
                <th className="p-4 text-right font-normal">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                  <td className="p-4">
                    <div className="font-bold">
                      {r.coin} <span className={r.side === "buy" ? "text-emerald-400" : "text-destructive"}>{r.side === "buy" ? "شراء" : "بيع"}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground" dir="ltr">{formatDateTime(r.time)}</div>
                  </td>
                  <td className="p-4 font-mono text-xs" dir="ltr">{r.id}</td>
                  <td className="p-4" dir="ltr">{r.fiat} {r.price}</td>
                  <td className="p-4" dir="ltr">
                    <div>{r.fiat} {r.amount}</div>
                    <div className="text-[11px] text-muted-foreground">{r.coin} {r.quantity}</div>
                  </td>
                  <td className="p-4">{r.counterparty || "—"}</td>
                  <td className="p-4">
                    <span className={r.status === "اكتملت" ? "text-emerald-400" : r.status === "ملغاة" ? "text-destructive" : ""}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CardTableInner({
  brandByPan4 = {},
  accountId,
}: {
  q?: any;
  brandByPan4?: Record<string, string>;
  accountId?: string;
}) {
  const [filter, setFilter] = usePersistentState<"all" | "success" | "failed" | "refund">("bybit.card.filter", "all");
  const [openId, setOpenId] = usePersistentState<string | null>("bybit.card.open", null);
  const PAGE_SIZE = 150;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filter]);

  // The archive is read one page at a time: the full stored history is far too
  // large to travel in a single response, which is what left the table empty.
  const txnsFn = useServerFn(getBybitCardTxns);
  const q = useQuery({
    queryKey: ["bybit-card", accountId, filter, page],
    queryFn: () => txnsFn({ data: { accountId, status: filter, page, pageSize: PAGE_SIZE } }),
    placeholderData: (prev: any) => prev,
    staleTime: 30_000,
  });

  const shown: any[] = (q.data as any)?.rows ?? [];
  const total = Number((q.data as any)?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);

  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 overflow-hidden">
      <div className="flex items-center justify-start gap-2 p-4">
        <div className="flex items-center gap-1">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>الكل</Chip>
          <Chip active={filter === "success"} onClick={() => setFilter("success")}>المشتريات الناجحة</Chip>
          <Chip active={filter === "failed"} onClick={() => setFilter("failed")}>المشتريات الفاشلة</Chip>
          <Chip active={filter === "refund"} onClick={() => setFilter("refund")}>المبلغ المسترد</Chip>
        </div>
      </div>
      {q.isLoading ? (
        <Empty text="جارٍ التحميل…" />
      ) : !shown.length ? (
        <Empty text="لا توجد معاملات" />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="p-4 text-right font-normal">اسم التاجر</th>
                <th className="p-4 text-center font-normal">إجمالي المبلغ المصحح</th>
                <th className="p-4 text-right font-normal">النوع</th>
                <th className="p-4 text-right font-normal">الحالة</th>
                <th className="p-4 text-right font-normal">تاريخ ووقت المعاملة</th>
                <th className="p-4 text-right font-normal">آخر 4 أرقام للبطاقة</th>
                <th className="p-4 text-right font-normal">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <Fragment key={t.id}>
                <tr className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center justify-start gap-3">
                      <MerchantLogo name={t.merchant} />
                      <span className="font-semibold">{t.merchant}</span>
                    </div>
                  </td>
                  <td className="p-4 text-center font-bold tabular-nums text-destructive" dir="ltr">
                    -{t.currency} {Math.abs(t.amount).toFixed(2)}
                  </td>
                  <td className="p-4 text-xs text-muted-foreground">
                    {t.status === "refund" ? "استرداد" : t.type ? String(t.type) : "شراء"}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${t.status === "failed" ? "bg-red-500/15 text-red-400" : t.status === "refund" ? "bg-muted text-muted-foreground" : t.status === "pending" ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                      {t.status === "failed" ? "فاشلة" : t.status === "refund" ? "مسترد" : t.status === "pending" ? "قيد التنفيذ" : "ناجحة"}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-muted-foreground tabular-nums">{dt(t.time)}</td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-2">
                      <span className="scale-90 origin-right">
                        <BrandBadge brand={brandByPan4[String(t.pan4 ?? "").trim()] || t.cardBrand || "Visa"} />
                      </span>
                      <span className="font-bold tabular-nums">{t.pan4 || "—"}</span>
                    </span>
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => setOpenId((v: string | null) => (v === t.id ? null : t.id))}
                      className="table-btn"
                    >
                      التفاصيل
                      <ChevronDown className={`size-3.5 transition-transform ${openId === t.id ? "rotate-180" : ""}`} />
                    </button>
                  </td>
                </tr>
                {openId === t.id && (
                  <tr className="border-b border-border/40 bg-muted/20">
                    <td colSpan={7} className="p-4">
                      <TxnDetails txn={t} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pageCount > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border/40 p-4" dir="rtl">
          <button
            onClick={() => setPage(Math.max(1, current - 1))}
            disabled={current === 1}
            className="rounded-lg border border-border/60 bg-card px-3 py-1.5 text-xs disabled:opacity-40"
          >
            السابق
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === pageCount || Math.abs(p - current) <= 2)
            .map((p, i, arr) => (
              <Fragment key={p}>
                {i > 0 && arr[i - 1] !== undefined && p - (arr[i - 1] as number) > 1 && (
                  <span className="px-1 text-xs text-muted-foreground">…</span>
                )}
                <button
                  onClick={() => setPage(p)}
                  className={`min-w-9 rounded-lg border px-3 py-1.5 text-xs tabular-nums ${
                    p === current
                      ? "border-primary bg-primary text-primary-foreground font-bold"
                      : "border-border/60 bg-card hover:bg-muted/20"
                  }`}
                >
                  {p}
                </button>
              </Fragment>
            ))}
          <button
            onClick={() => setPage(Math.min(pageCount, current + 1))}
            disabled={current === pageCount}
            className="rounded-lg border border-border/60 bg-card px-3 py-1.5 text-xs disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
}

type FieldDef = [string, string];

const CORE_FIELDS: FieldDef[] = [
  ["txnId", "معرّف المعاملة"],
  ["orderId", "معرّف الطلب / المرجع"],
  ["paymentId", "معرّف الدفع"],
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
  ["paidWithFiat", "المدفوع نقدًا"],
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
  ["terminalId", "معرّف الطرفية"],
  ["storeId", "معرّف المتجر"],
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

function TxnDetails({ txn }: { txn: any }) {
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




function AssetTable({
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
        <Empty text="جارٍ التحميل…" />
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
  ["id", "المعرّف"],
  ["coin", "العملة"],
  ["chain", "نوع السلسلة"],
  ["amount", "الكمية"],
  ["fee", "الرسوم"],
  ["address", "العنوان"],
  ["txId", "معرّف المعاملة"],
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

export function ApiKeyPanel({ onSaved }: { configured?: boolean; onSaved?: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listBybitAccounts);
  const addFn = useServerFn(addBybitAccount);

  const [open, setOpen] = useState(true);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [errors, setErrors] = useState<{ name?: string; apiKey?: string; apiSecret?: string }>({});
  const [busy, setBusy] = useState(false);

  const accounts = useQuery({ queryKey: ["bybit-accounts"], queryFn: () => listFn() });
  const list = ((accounts.data as any)?.accounts ?? []) as Array<{ id: string; name: string; uid: string | null }>;

  async function connect() {
    const e = validateBybitCreds({ name, apiKey, apiSecret });
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(Object.values(e)[0] as string);
      return;
    }
    setBusy(true);
    try {
      const r: any = await addFn({ data: { apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), name: name.trim() } });
      if (r?.ok) {
        toast.success("تمت إضافة حساب Bybit جديد");
        setName(""); setApiKey(""); setApiSecret(""); setOpen(false);
        qc.invalidateQueries({ queryKey: ["bybit-accounts"] });
        onSaved?.();
      } else {
        toast.error(`فشل الاتصال: ${r?.error ?? "تحقق من المفاتيح"}`);
      }
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className={`size-2 rounded-full ${list.length ? "bg-emerald-400" : "bg-muted-foreground"}`} />
          <span className="text-muted-foreground">
            {list.length ? `${list.length} حساب مرتبط` : "لا توجد حسابات مربوطة — أضف مفتاح API من منصة Bybit"}
          </span>
        </div>
        <Button variant="secondary" size="sm" className="rounded-xl" onClick={() => setOpen((v) => !v)}>
          {open ? "إغلاق" : "إضافة حساب جديد"}
        </Button>
      </div>

      {!!list.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {list.map((a) => (
            <span key={a.id} className="rounded-lg border border-border/60 bg-background/60 px-2 py-1 text-[11px]">
              {a.name}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-4 grid gap-3">
          <Field label="اسم الحساب" error={errors.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="مثال: حساب الشركة الرئيسي" className="rounded-xl" />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="API Key" error={errors.apiKey}>
              <Input dir="ltr" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" className="rounded-xl" />
            </Field>
            <Field label="API Secret" error={errors.apiSecret}>
              <Input dir="ltr" type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="API Secret" className="rounded-xl" />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground leading-5">
              أنشئ المفتاح من Bybit → API Management بصلاحيات قراءة فقط (Wallet / Assets / Card). كل مفتاح يضيف حسابًا جديدًا مستقلًا.
            </p>
            <Button className="rounded-xl" onClick={connect} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin ml-1" /> : null}
              إضافة الحساب
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}



