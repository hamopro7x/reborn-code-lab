import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { heroIcon, isInternalUrl, type HeroBanner } from "@/lib/hero-banners";

const alignClass = {
  start: "items-start text-start",
  center: "items-center text-center",
  end: "items-end text-end",
} as const;

const justifyClass = { start: "justify-start", center: "justify-center", end: "justify-end" } as const;

function ButtonRow({ banner }: { banner: HeroBanner }) {
  const buttons = banner.buttons.filter((b) => b.enabled && b.label.trim());
  if (!buttons.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-3 ${justifyClass[banner.text_align]}`}>
      {buttons.map((b) => {
        const Icon = heroIcon(b.icon);
        const cls =
          b.variant === "teal"
            ? "bg-teal text-teal-foreground hover:bg-teal/90"
            : b.variant === "outline"
              ? "bg-transparent border border-border text-foreground hover:bg-muted"
              : "";
        const inner = (
          <Button
            className={`px-6 rounded-full font-bold gap-2 ${cls}`}
            style={{ height: banner.button_size, fontSize: Math.max(13, Math.round(banner.button_size * 0.34)) }}
          >
            {b.label}
            {Icon && <Icon className="size-4" />}
          </Button>
        );
        return isInternalUrl(b.url) ? (
          <Link key={b.id} to={b.url as any}>
            {inner}
          </Link>
        ) : (
          <a key={b.id} href={b.url} target="_blank" rel="noreferrer noopener">
            {inner}
          </a>
        );
      })}
    </div>
  );
}

function BadgeCards({ banner }: { banner: HeroBanner }) {
  const badges = banner.badges.filter((b) => b.enabled && (b.title.trim() || b.value.trim()));
  if (!badges.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {badges.map((b) => {
        const Icon = heroIcon(b.icon);
        return (
          <div
            key={b.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 w-[170px]"
          >
            {Icon && (
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: b.color }}
              >
                <Icon className="size-4" />
              </span>
            )}
            <span className="flex flex-col min-w-0">
              {b.title && <span className="text-[11px] text-muted-foreground truncate">{b.title}</span>}
              {b.value && <span className="text-sm font-bold text-foreground truncate">{b.value}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Media({ banner, preview }: { banner: HeroBanner; preview?: boolean }) {
  if (banner.media_type === "video" && banner.media_url) {
    return (
      <video
        key={banner.media_url}
        src={banner.media_url}
        poster={banner.poster_url ?? undefined}
        autoPlay={banner.video_autoplay}
        muted={banner.video_muted || banner.video_autoplay}
        loop={banner.video_loop}
        playsInline
        controls={false}
        preload={preview ? "metadata" : "auto"}
        className="w-full h-full object-cover"
      />
    );
  }
  if (banner.media_type === "image" && banner.media_url) {
    return (
      <img
        key={banner.media_url}
        src={banner.media_url}
        alt={banner.title || "بانر"}
        width={900}
        height={600}
        className="w-full h-full object-cover"
        loading={preview ? "lazy" : "eager"}
      />
    );
  }
  return <div className="w-full h-full" style={{ backgroundColor: banner.background_color ?? undefined }} />;
}

/** عرض بانر واحد — يُستخدم في الصفحة الرئيسية وفي المعاينة داخل لوحة الإدارة. */
export function HeroBannerView({ banner, preview }: { banner: HeroBanner; preview?: boolean }) {
  const hasBadges = banner.badges.some((b) => b.enabled && (b.title.trim() || b.value.trim()));
  const hasMedia = banner.media_type !== "none";
  const sideButtons = banner.buttons_position === "side";

  return (
    <div
      className="relative h-[260px] md:h-[340px] overflow-hidden"
      style={{ backgroundColor: banner.background_color ?? undefined }}
    >
      {/* الخلفية / الوسائط — تغطي كامل مساحة البنر */}
      {hasMedia && (
        <div className="absolute inset-0 overflow-hidden">
          <Media banner={banner} preview={preview} />
        </div>
      )}

      {/* طبقة التعتيم فوق الوسائط وتحت المحتوى */}
      {hasMedia && banner.overlay_enabled && (
        <>
          <div
            className="absolute inset-0 md:hidden"
            style={{ backgroundColor: banner.overlay_color, opacity: Math.min(1, banner.overlay_opacity + 0.4) }}
          />
          <div
            className="absolute inset-0 hidden md:block"
            style={{ backgroundColor: banner.overlay_color, opacity: banner.overlay_opacity }}
          />
        </>
      )}

      {/* المحتوى فوق الوسائط */}
      <div className="relative h-full grid md:grid-cols-[auto_minmax(0,1fr)]">
      <div
        className={`relative md:order-2 p-6 md:p-10 flex flex-col min-w-0 overflow-hidden ${justifyClass[banner.content_position_y]} ${alignClass[banner.content_position_x]}`}
      >

        {banner.show_title && banner.title && (
          <h1
            className="font-black leading-tight line-clamp-3"
            style={{ fontSize: `clamp(${banner.title_size_mobile}px, 4vw, ${banner.title_size}px)` }}
          >
            {banner.title}
          </h1>
        )}
        {banner.show_subtitle && banner.subtitle && (
          <p
            className="text-hero-foreground/70 line-clamp-3 max-w-md"
            style={{
              marginTop: banner.show_title && banner.title ? banner.gap_title_subtitle : 0,
              fontSize: `clamp(${banner.subtitle_size_mobile}px, 2vw, ${banner.subtitle_size}px)`,
            }}
          >
            {banner.subtitle}
          </p>
        )}
        <div className={sideButtons ? "md:hidden w-full" : "w-full"} style={{ marginTop: banner.gap_subtitle_buttons }}>
          <ButtonRow banner={banner} />
        </div>
      </div>

      {/* الكروت الصغيرة + الأزرار الجانبية */}
      {(hasBadges || sideButtons) && (
        <div className="hidden md:flex md:order-1 flex-col justify-center gap-3 p-6 min-w-0">
          <BadgeCards banner={banner} />
          {sideButtons && <ButtonRow banner={banner} />}
        </div>
      )}
      </div>
    </div>
  );
}

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
      className="relative overflow-hidden rounded-b-2xl border border-border bg-hero text-hero-foreground"
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
      <HeroBannerView banner={active} />

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
