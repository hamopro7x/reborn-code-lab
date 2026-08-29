import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export type HeroSlide = {
  id: string;
  title: string;
  subtitle?: string | null;
  image?: string | null;
  to: string;
  params?: Record<string, string>;
  cta?: string;
};

export type HeroBadge = { title: string; value: string };

export function HeroCarousel({ slides, badges = [] }: { slides: HeroSlide[]; badges?: HeroBadge[] }) {
  const [index, setIndex] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = window.setInterval(() => {
      if (!paused.current) setIndex((i) => (i + 1) % slides.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, [slides.length]);

  useEffect(() => {
    if (index > slides.length - 1) setIndex(0);
  }, [slides.length, index]);

  if (!slides.length) return null;
  const active = slides[Math.min(index, slides.length - 1)];

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-border bg-hero text-hero-foreground"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      aria-label="عروض مميزة"
    >
      <div className="relative h-[260px] md:h-[340px] grid md:grid-cols-2 overflow-hidden">
        {/* Artwork — ثابت الحجم مهما كان حجم الصورة الأصلية */}
        <div className="absolute inset-y-0 left-0 w-full md:w-1/2 md:order-1 overflow-hidden">
          {active.image ? (
            <img
              key={active.id}
              src={active.image}
              alt={active.title}
              width={900}
              height={600}
              className="w-full h-full object-cover opacity-30 md:opacity-100 transition-opacity duration-500"
              loading="eager"
            />
          ) : (
            <div className="w-full h-full bg-hero" />
          )}
          <div className="absolute inset-0 bg-hero/75 md:bg-transparent" />
        </div>

        {/* Text */}
        <div className="relative md:order-2 p-6 md:p-10 flex flex-col justify-center gap-4 min-w-0">
          <h1 className="text-2xl md:text-4xl font-black leading-tight line-clamp-3">{active.title}</h1>
          {active.subtitle && (
            <p className="text-sm md:text-base text-hero-foreground/70 line-clamp-3 max-w-md">{active.subtitle}</p>
          )}
          {badges.length > 0 && (
            <ul className="hidden sm:flex lg:hidden flex-wrap gap-2 pt-1">
              {badges.map((b) => (
                <li key={b.title} className="rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] text-card-foreground">
                  <span className="text-muted-foreground">{b.title} </span>
                  <span className="font-bold">{b.value}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link to={active.to as any} params={active.params as any}>
              <Button size="lg" className="h-11 px-6 font-bold gap-2">
                {active.cta ?? "تسوق الآن"}
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <Link to="/track">
              <Button size="lg" className="h-11 px-6 font-bold bg-teal text-teal-foreground hover:bg-teal/90">
                تتبع طلبك
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {badges.length > 0 && (
        <ul className="absolute top-1/2 -translate-y-1/2 left-4 hidden lg:flex w-44 flex-col gap-2">
          {badges.map((b) => (
            <li key={b.title} className="rounded-xl border border-border bg-card px-3 py-2 text-card-foreground">
              <div className="text-[11px] text-muted-foreground truncate">{b.title}</div>
              <div className="text-sm font-bold truncate">{b.value}</div>
            </li>
          ))}
        </ul>
      )}

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
            aria-label="السابق"
            className="absolute top-1/2 -translate-y-1/2 right-3 size-9 rounded-full border border-border bg-card text-card-foreground flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % slides.length)}
            aria-label="التالي"
            className="absolute top-1/2 -translate-y-1/2 left-3 size-9 rounded-full border border-border bg-card text-card-foreground flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2">
            {slides.map((s, i) => (
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
