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
  const shownBadges = badges.slice(0, 3);

  const ctaButtons = (
    <>
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
    </>
  );

  return (
    <section
      className="relative overflow-hidden rounded-b-2xl border border-border bg-hero text-hero-foreground"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      aria-label="عروض مميزة"
    >
      <div className="relative h-[260px] md:h-[340px] grid md:grid-cols-[1fr_auto_minmax(0,1fr)] overflow-hidden">
        {/* Artwork — ثابت الحجم مهما كان حجم الصورة الأصلية */}
        <div className="absolute inset-y-0 left-0 w-full md:static md:w-auto md:order-2 overflow-hidden md:aspect-[4/3] md:h-full">
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
        <div className="relative md:order-1 p-6 md:p-10 flex flex-col justify-center gap-4 min-w-0 overflow-hidden">
          <h1 className="text-2xl md:text-4xl font-black leading-tight line-clamp-3">{active.title}</h1>
          {active.subtitle && (
            <p className="text-sm md:text-base text-hero-foreground/70 line-clamp-3 max-w-md">{active.subtitle}</p>
          )}
          <div className="flex md:hidden flex-wrap items-center gap-3 pt-1">
            {ctaButtons}
          </div>
        </div>

        {/* Badges + CTAs */}
        <div className="hidden md:flex md:order-3 flex-col justify-center gap-3 p-6 min-w-0">
          {shownBadges.map((b) => (
            <div
              key={b.title}
              className="rounded-xl border border-border bg-card/80 px-4 py-3 flex flex-col gap-0.5"
            >
              <span className="text-xs text-hero-foreground/70">{b.title}</span>
              <span className="text-sm font-black text-primary">{b.value}</span>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {ctaButtons}
          </div>
        </div>
      </div>



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
