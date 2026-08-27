import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShoppingCart, Clock, Timer, CalendarDays, ChevronsLeft } from "lucide-react";

const labels = {
  d: ["يوم", "أيام"],
  h: ["ساعة", "ساعات"],
  m: ["دقيقة", "دقائق"],
  s: ["ثانية", "ثواني"],
} as const;

function label(key: keyof typeof labels, value: number) {
  return value === 1 || value > 10 ? labels[key][0] : labels[key][1];
}

function Ring({ value, max, children }: { value: number; max: number; children: React.ReactNode }) {
  const pct = Math.min(1, Math.max(0, value / max));
  const r = 46;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  return (
    <div className="relative w-12 h-12 md:w-14 md:h-14 flex items-center justify-center">
      <svg viewBox="0 0 110 110" className="absolute inset-0 w-full h-full -rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="oklch(0.78 0.24 120)" />
            <stop offset="100%" stopColor="oklch(0.65 0.22 120)" />
          </linearGradient>
        </defs>
        {/* ticks */}
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i / 60) * Math.PI * 2;
          const x1 = 55 + Math.cos(a) * 52;
          const y1 = 55 + Math.sin(a) * 52;
          const x2 = 55 + Math.cos(a) * (i % 5 === 0 ? 46 : 48.5);
          const y2 = 55 + Math.sin(a) * (i % 5 === 0 ? 46 : 48.5);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="oklch(0.65 0.22 120)"
              strokeOpacity={i % 5 === 0 ? 0.55 : 0.28}
              strokeWidth={i % 5 === 0 ? 1.4 : 0.8}
              strokeLinecap="round"
            />
          );
        })}
        {/* progress arc */}
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ filter: "drop-shadow(0 0 6px oklch(0.78 0.24 120 / 0.7))" }}
        />
      </svg>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function Countdown({ endsAt, title, subtitle }: { endsAt: string; title: string; subtitle?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const end = new Date(endsAt).getTime();
  const diff = Math.max(0, end - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff / 3600000) % 24);
  const m = Math.floor((diff / 60000) % 60);
  const s = Math.floor((diff / 1000) % 60);
  if (diff === 0) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  // In RTL, DOM order left→right renders visually right→left.
  // Reference shows (right→left): DAYS, HOURS, MINUTES, SECONDS,
  // so DOM order needs to be: seconds, minutes, hours, days.
  const units = [
    { key: "s", value: s, max: 60, label: label("s", s), Icon: Timer },
    { key: "m", value: m, max: 60, label: label("m", m), Icon: Clock },
    { key: "h", value: h, max: 24, label: label("h", h), Icon: Clock },
    { key: "d", value: d, max: Math.max(d, 30), label: label("d", d), Icon: CalendarDays },
  ];

  // Split title so the last word gets a gold accent, like the reference.
  const titleParts = title.trim().split(/\s+/);
  const titleHead = titleParts.slice(0, -1).join(" ");
  const titleTail = titleParts[titleParts.length - 1];

  return (
    <div className="relative overflow-hidden rounded-xl w-full max-w-3xl mx-auto border border-primary/25 bg-gradient-to-b from-[oklch(0.11 0 0)]/95 to-[oklch(0.08 0 0)]/95 backdrop-blur-xl px-2 py-1.5 md:px-4 md:py-2 shadow-[0_10px_40px_-12px_oklch(0.5_0.3_300/0.5)]">
      {/* ambient glows */}
      <div className="pointer-events-none absolute -top-20 right-1/4 size-48 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/4 size-48 rounded-full bg-accent/15 blur-3xl" />
      {/* floor light */}
      <div className="pointer-events-none absolute inset-x-8 bottom-1 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-20 bottom-2 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

      {/* Header */}
      <div className="relative flex flex-col items-center text-center mb-1 md:mb-2">
        <div className="flex items-center gap-1.5 text-primary/70 mb-1">
          <span className="h-px w-5 bg-gradient-to-l from-primary/60 to-transparent" />
          <span className="flex gap-0.5">
            <span className="size-0.5 rounded-full bg-primary/70" />
            <span className="size-0.5 rounded-full bg-primary/70" />
            <span className="size-0.5 rounded-full bg-primary/70" />
          </span>
          <span className="h-px w-5 bg-gradient-to-r from-primary/60 to-transparent" />
        </div>
        <h3 className="font-black text-sm md:text-xl leading-tight tracking-tight">
          <span className="text-foreground">{titleHead}</span>
          {titleHead && " "}
          <span className="text-gold" style={{ textShadow: "0 0 18px oklch(0.82 0.15 85 / 0.4)" }}>{titleTail}</span>
        </h3>
        {subtitle && (
          <div className="flex items-center gap-1.5 mt-1 md:mt-2">
            <span className="h-px w-6 md:w-10 bg-gradient-to-l from-primary/50 to-transparent" />
            <span className="text-xs md:text-base font-semibold text-foreground/90 tracking-normal">{subtitle}</span>
            <span className="h-px w-6 md:w-10 bg-gradient-to-r from-primary/50 to-transparent" />
          </div>
        )}
      </div>

      {/* Timer cards */}
      <div className="relative grid grid-cols-4 gap-1 md:gap-2">
        {units.map((u) => (
          <div key={u.key} className="flex items-center">
            <div className="relative flex-1 rounded-lg border border-primary/30 bg-[oklch(0.1 0 0)]/60 backdrop-blur-md p-0.5 md:p-1 flex flex-col items-center gap-0 md:gap-0.5 overflow-hidden">
              {/* card inner glow */}
              <div className="absolute inset-0 rounded-lg bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
              <div className="absolute -inset-px rounded-lg bg-gradient-to-b from-primary/20 via-transparent to-primary/10 opacity-40 pointer-events-none" style={{ mask: "linear-gradient(#000,#000) content-box, linear-gradient(#000,#000)", WebkitMask: "linear-gradient(#000,#000) content-box, linear-gradient(#000,#000)", WebkitMaskComposite: "xor", padding: 1 }} />
              <Ring value={u.value} max={u.max}>
                <span className="font-black text-sm md:text-base text-foreground tabular-nums leading-none" style={{ textShadow: "0 0 12px oklch(0.78 0.24 120 / 0.4)" }}>
                  {pad(u.value)}
                </span>
              </Ring>
              <span className="text-[8px] md:text-[10px] text-primary/80 font-medium tracking-wide">{u.label}</span>
              <u.Icon className="size-1.5 md:size-2 text-primary/60" strokeWidth={1.75} />
              {/* bottom light */}
              <div className="absolute inset-x-2 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="relative mt-1.5 md:mt-2 flex justify-center">
        <Link
          to="/shop"
          className="group relative inline-flex items-center gap-0.5 md:gap-1 rounded-md border border-gold/40 bg-[oklch(0.1 0 0)]/80 backdrop-blur-md pr-1.5 pl-0.5 md:pr-2 md:pl-1 py-0.5 md:py-0.5 overflow-hidden hover:-translate-y-0.5 transition-transform"
          style={{ boxShadow: "0 6px 20px -6px oklch(0.82 0.15 85 / 0.35), inset 0 1px 0 0 oklch(0.85 0.15 85 / 0.15)" }}
        >
          <span className="absolute inset-0 bg-gradient-to-l from-gold/10 via-transparent to-transparent pointer-events-none" />
          <span className="flex items-center gap-0.5 md:gap-0.5 text-[9px] md:text-[11px] font-black">
            <ChevronsLeft className="size-1.5 md:size-2 text-gold group-hover:-translate-x-1 transition-transform" strokeWidth={3} />
            <span className="text-foreground">سارع</span>
            <span className="text-gold">الآن</span>
            <span className="text-foreground">قبل انتهاء العرض</span>
          </span>
          <span className="relative flex items-center justify-center size-5 md:size-6 rounded-sm gradient-gold text-[oklch(0.15_0.05_60)]" style={{ boxShadow: "0 0 14px oklch(0.82 0.15 85 / 0.5)" }}>
            <ShoppingCart className="size-2 md:size-2.5" strokeWidth={2.5} />
          </span>
        </Link>
      </div>
    </div>
  );
}
