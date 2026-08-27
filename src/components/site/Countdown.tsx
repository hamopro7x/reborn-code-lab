import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

const labels = {
  d: ["يوم", "أيام"],
  h: ["ساعة", "ساعات"],
  m: ["دقيقة", "دقائق"],
  s: ["ثانية", "ثواني"],
} as const;

function label(key: keyof typeof labels, value: number) {
  return value === 1 || value > 10 ? labels[key][0] : labels[key][1];
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
  // RTL: DOM order left→right renders visually right→left (days first on the right).
  const units = [
    { key: "s", value: s, label: label("s", s) },
    { key: "m", value: m, label: label("m", m) },
    { key: "h", value: h, label: label("h", h) },
    { key: "d", value: d, label: label("d", d) },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl rounded-lg border border-border bg-card px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3">
        {units.map((u) => (
          <div key={u.key} className="rounded border border-border bg-background px-2 py-3 text-center">
            <div className="num text-xl font-semibold leading-none md:text-2xl">{pad(u.value)}</div>
            <div className="mt-1.5 text-[11px] text-muted-foreground">{u.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Link to="/shop" className="text-sm font-medium text-primary">
          تسوق قبل انتهاء العرض
        </Link>
      </div>
    </div>
  );
}
