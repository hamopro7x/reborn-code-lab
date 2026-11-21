import { useEffect, useRef, useState } from "react";
import { Search, Globe, ShoppingCart, Menu } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SITE_WIDTH = 1280;
const SITE_HEIGHT = 340;
export function ScaledPreview({ children, width, height }: { children: React.ReactNode; width?: number; height?: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const w = width ?? SITE_WIDTH;
  const h = height ?? SITE_HEIGHT;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / w));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);

  return (
    <div ref={boxRef} className="mt-1 w-full" style={{ height: h * scale }}>
      <div
        className="overflow-hidden rounded-2xl border border-border bg-hero text-hero-foreground"
        style={{
          width: w,
          height: h,
          transform: `scale(${scale})`,
          transformOrigin: "top right",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function MobilePagePreview({ children }: { children: React.ReactNode }) {
  return (
    <ScaledPreview width={408} height={778}>
      <div className="relative flex h-full flex-col overflow-hidden rounded-[32px] border-8 border-secondary bg-background">
        <span className="absolute left-1/2 top-0 z-20 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-secondary" aria-hidden="true" />
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg border border-border bg-muted" />
            <div className="text-right leading-tight">
              <p className="text-sm font-bold">MG Pro</p>
              <p className="text-xs text-muted-foreground">الاشتراكات الرقمية</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <Search className="size-4" />
            <Globe className="size-4" />
            <ShoppingCart className="size-4" />
            <Menu className="size-4" />
          </div>
        </div>
        <div className="h-[150px] shrink-0">{children}</div>
        <div className="flex-1 space-y-5 bg-background px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-6 w-1 rounded-full bg-primary" />
              <span className="text-base font-bold">تصفح الأقسام</span>
            </div>
            <span className="rounded-lg bg-card px-3 py-2 text-xs text-muted-foreground">عرض الكل</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[0, 1].map((item) => (
              <div key={item} className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="h-28 bg-muted" />
                <div className="border-t border-border p-3 text-sm font-bold">قسم المتجر</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border bg-card p-4 text-right">
            <p className="text-sm font-bold">متجر الاشتراكات الرقمية</p>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">اشتراكات رقمية وخدمة موثوقة في مكان واحد.</p>
          </div>
        </div>
      </div>
    </ScaledPreview>
  );
}


export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export const POS = [
  { value: "start", label: "البداية" },
  { value: "center", label: "الوسط" },
  { value: "end", label: "النهاية" },
];

export function NumField({ label, value, onChange, min = 0, max = 120 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
