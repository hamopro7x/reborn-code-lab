import { useState } from "react";

/** صورة العملة الرقمية بجانب اسمها (مع بدائل عند فشل التحميل) */
export function CoinIcon({ coin, className = "size-5" }: { coin: string; className?: string }) {
  const sym = (coin || "").trim().toLowerCase();
  const sources = sym
    ? [
        `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${sym}.png`,
        `https://assets.coincap.io/assets/icons/${sym}@2x.png`,
      ]
    : [];
  const [idx, setIdx] = useState(0);

  if (idx >= sources.length) {
    return (
      <span
        className={`${className} inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground`}
        aria-hidden
      >
        {(coin || "?").slice(0, 3).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={sources[idx]}
      alt={`${coin} icon`}
      loading="lazy"
      onError={() => setIdx((i) => i + 1)}
      className={`${className} shrink-0 rounded-full bg-background object-contain`}
    />
  );
}

/** شعار العملة الورقية / الدولار للمعاملات بالبطاقة */
export function FiatIcon({ code, className = "size-5" }: { code: string; className?: string }) {
  return (
    <span
      className={`${className} inline-flex shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-bold text-emerald-500`}
      aria-hidden
    >
      {(code || "USD").slice(0, 3).toUpperCase() === "USD" ? "$" : code.slice(0, 3).toUpperCase()}
    </span>
  );
}
