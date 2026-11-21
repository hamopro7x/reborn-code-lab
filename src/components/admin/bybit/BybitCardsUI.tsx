import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Download, Lock, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

export function detectBrand(input: string): string | null {
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

export const CARD_BRANDS = ["Visa", "MasterCard", "Amex", "UnionPay", "JCB", "Discover", "Diners", "Maestro"] as const;

export function BrandBadge({ brand }: { brand: string }) {
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

function BybitCardArt({ c, onDelete, canDelete = true, onEdit, onToggleFreeze }: { c: any; onDelete?: () => void; canDelete?: boolean; onEdit?: () => void; onToggleFreeze?: (frozen: boolean) => void }) {
  const name = c.name || `بطاقة ${c.brand || "Visa"}`;
  const normalizedStatus = String(c.status ?? "active").trim().toLowerCase();
  const isFrozen = ["frozen", "freeze", "blocked", "inactive", "مجمّدة", "مجمدة"].includes(normalizedStatus);
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
        <button
          type="button"
          disabled={!onToggleFreeze}
          onClick={() => onToggleFreeze?.(!isFrozen)}
          title={onToggleFreeze ? (isFrozen ? "إلغاء التجميد" : "تجميد البطاقة") : undefined}
          className={`${isFrozen ? "inline-flex items-center gap-1 rounded-md bg-destructive/15 px-2 py-1 text-[10px] font-black text-destructive" : "inline-flex items-center gap-1 rounded-md bg-[#f7a600] px-2 py-1 text-[10px] font-black text-black"} ${onToggleFreeze ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
        >
          <Lock className={isFrozen ? "size-3" : "hidden"} aria-hidden="true" />
          {isFrozen ? "مجمدة" : "نشطة"}
        </button>
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
        aria-disabled={isFrozen}
        style={{ backgroundImage: theme.bg, borderColor: theme.border }}
        className={`relative aspect-[85.6/53.98] w-full overflow-hidden rounded-[12px] border shadow-[0_10px_24px_-10px_rgba(0,0,0,0.9)] ${isFrozen ? "pointer-events-none select-none" : ""}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_85%_0%,rgba(255,255,255,0.08),transparent_60%)]" />

        {isFrozen ? (
          <div className="absolute inset-0 z-20 grid place-items-center bg-background/80" aria-label="البطاقة مجمدة">
            <div className="flex flex-col items-center gap-2 text-foreground">
              <Lock className="size-7" aria-hidden="true" />
              <span className="text-xs font-black">البطاقة مجمدة</span>
            </div>
          </div>
        ) : null}

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

export function CardsPanel({ q, isAdmin, onAdd, onDelete, onEdit, onToggleFreeze }: { q: any; isAdmin: boolean; onAdd: () => void; onDelete: (id: string) => void; onEdit?: (c: any) => void; onToggleFreeze?: (c: any, frozen: boolean) => void }) {
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
            <BybitCardArt key={c.id || c.pan4} c={c} canDelete={isAdmin} onDelete={() => c.id && onDelete(c.id)} onEdit={isAdmin && c.id ? () => onEdit?.(c) : undefined} onToggleFreeze={isAdmin && c.id && onToggleFreeze ? (frozen) => onToggleFreeze(c, frozen) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
