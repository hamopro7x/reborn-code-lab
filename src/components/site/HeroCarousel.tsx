import { useEffect, useRef, useState } from "react";
import { HeroBannerView } from "@/components/site/HeroBannerView";
import { ChevronLeft, ChevronRight, Construction } from "lucide-react";
import {
  type HeroBanner,
} from "@/lib/hero-banners";

export function HeroCarousel({ banners }: { banners: HeroBanner[] }) {
  const [index, setIndex] = useState(0);
  const paused = useRef(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    if (banners.length < 2) return;
    const id = window.setInterval(() => {
      if (!paused.current) setIndex((i) => (i + 1) % banners.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, [banners.length]);

  useEffect(() => {
    if (index > banners.length - 1) setIndex(0);
  }, [banners.length, index]);

  if (!banners.length) return null;
  const active = banners[Math.min(index, banners.length - 1)];

  return (
    <section
      className="relative overflow-hidden bg-hero text-hero-foreground"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        if (start == null || banners.length < 2) return;
        const dx = (e.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(dx) < 40) return;
        setIndex((i) => (dx < 0 ? (i + 1) % banners.length : (i - 1 + banners.length) % banners.length));
      }}
      aria-label="عروض مميزة"
    >
      {/* إعلان «الموقع تحت الإنشاء» — داخل البانر وبخط كبير */}
      <div className="hero-notice">
        <Construction className="hero-notice-icon" aria-hidden="true" />
        <span>الموقع تحت الإنشاء</span>
      </div>

      <HeroBannerView banner={active!} />

      {banners.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setIndex((i) => (i - 1 + banners.length) % banners.length)}
            aria-label="السابق"
            className="absolute top-1/2 -translate-y-1/2 right-3 size-9 rounded-full border border-border bg-card text-card-foreground flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % banners.length)}
            aria-label="التالي"
            className="absolute top-1/2 -translate-y-1/2 left-3 size-9 rounded-full border border-border bg-card text-card-foreground flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2">
            {banners.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`الشريحة ${i + 1}`}
                aria-current={i === index}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}