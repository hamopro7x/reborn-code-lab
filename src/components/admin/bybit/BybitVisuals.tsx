import { useState } from "react";
import tonAsset from "@/assets/ton.png.asset.json";

const USDT_LOGO = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png";

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
      <div className="text-right text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex w-full items-center justify-end gap-2 text-right text-2xl font-black" dir="ltr">
        <img src={USDT_LOGO} alt="" className="size-5 shrink-0 rounded-full" aria-hidden="true" />
        <span className="text-sm font-bold text-muted-foreground">USDT</span>
        <span>{value}</span>
      </div>
      {hint ? <div className="mt-1 text-right text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function Chip({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
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

export function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>;
}

export type CoinRow = { coin: string; balance: number; usd: number };

/** USDT is the primary coin — always show it, even with a zero balance. */
export function visibleCoins(all: CoinRow[]): CoinRow[] {
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

export function MerchantLogo({ name }: { name: string }) {
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

export function CoinLogo({ coin }: { coin: string }) {
  return <CryptoLogo name={coin} iconUrl={coinIconUrl(coin)} />;
}


export function CoinBalanceCard({ coin }: { coin: CoinRow }) {
  const isUsdt = String(coin.coin).toUpperCase() === "USDT";
  return (
    <div dir="ltr" className="relative mx-auto h-[96px] w-full max-w-[190px] shrink-0 rounded-[18px] p-[3px] bg-[radial-gradient(120%_120%_at_50%_0%,oklch(0.55_0.13_170/0.28),transparent_70%)]">
      <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-[15px] bg-[oklch(0.055_0.008_190)] px-3.5 py-2.5 shadow-[0_0_28px_-10px_oklch(0.6_0.14_170/0.35)]">

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="mb-1 text-[12px] font-bold leading-none text-[oklch(0.72_0.12_170)]">{coin.coin}</div>
            <div className="text-[26px] font-black leading-none tracking-tight tabular-nums text-white">
              {coin.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          {isUsdt ? (
            <img
              src={USDT_LOGO}
              alt="USDT"
              className="size-[38px] shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="grid size-[38px] shrink-0 place-items-center rounded-full bg-[oklch(0.18 0 0)] border border-border/50">
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


export function ChainLogo({ chain }: { chain: string }) {
  return <CryptoLogo name={chain} iconUrl={chainIconUrl(chain)} />;
}


export { USDT_LOGO };
