import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  heroIcon,
  isInternalUrl,
  type HeroBadgeItem,
  type HeroBanner,
  type HeroButton,
  type HeroLayerKey,
  type HeroPositions,
} from "@/lib/hero-banners";

const alignClass = {
  start: "items-start text-start",
  center: "items-center text-center",
  end: "items-end text-end",
} as const;

const justifyClass = { start: "justify-start", center: "justify-center", end: "justify-end" } as const;

function HeroButtonItem({
  banner,
  b,
  size,
  compact,
}: {
  banner: HeroBanner;
  b: HeroButton;
  size?: number;
  compact?: boolean;
}) {
  const Icon = heroIcon(b.icon);
  const cls =
    b.variant === "teal"
      ? "bg-teal text-teal-foreground hover:bg-teal/90"
      : b.variant === "outline"
        ? "bg-transparent border border-border text-foreground hover:bg-muted"
        : "";
  const buttonSize = size ?? banner.button_size;
  const px = compact ? "px-2.5" : "px-6";
  const gap = compact ? "gap-1" : "gap-2";
  const iconSize = compact ? "size-3" : "size-4";
  const inner = (
    <Button
      className={`${px} rounded-full font-bold ${gap} ${cls}`}
      style={{ height: buttonSize, fontSize: Math.max(compact ? 10 : 13, Math.round(buttonSize * 0.34)) }}
    >
      {b.label}
      {Icon && <Icon className={iconSize} style={{ color: "#87939f" }} />}
    </Button>
  );
  return isInternalUrl(b.url) ? (
    <Link to={b.url as any}>{inner}</Link>
  ) : (
    <a href={b.url} target="_blank" rel="noreferrer noopener">
      {inner}
    </a>
  );
}

function BadgeCard({ b }: { b: HeroBadgeItem }) {
  const Icon = heroIcon(b.icon);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 w-[170px]">
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
}

function Media({ banner, preview }: { banner: HeroBanner; preview?: boolean }) {
  const fit = banner.media_fit === "contain" ? "object-contain" : "object-cover";
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
        className={`w-full h-full ${fit}`}
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
        className={`w-full h-full ${fit}`}
        loading={preview ? "lazy" : "eager"}
        decoding={preview ? "async" : "sync"}
        {...(preview ? {} : { fetchPriority: "high" as const })}
      />
    );
  }
  return <div className="w-full h-full" style={{ backgroundColor: banner.background_color ?? undefined }} />;
}

/** عرض بانر واحد — يُستخدم في الصفحة الرئيسية وفي المعاينة داخل لوحة الإدارة. */
export function HeroBannerView({
  banner,
  preview,
  editable,
  onPositionsChange,
}: {
  banner: HeroBanner;
  preview?: boolean;
  /** يسمح بتحريك كل عنصر بالماوس داخل المعاينة. */
  editable?: boolean;
  onPositionsChange?: (p: HeroPositions) => void;
}) {
  const hasMedia = banner.media_type !== "none";
  const sideButtons = banner.buttons_position === "side";
  const pos = banner.positions ?? {};
  const rootRef = useRef<HTMLDivElement>(null);
  const canDrag = Boolean(editable && onPositionsChange);

  const buttons = banner.buttons.filter((b) => b.enabled && b.label.trim());
  const badges = banner.badges.filter((b) => b.enabled && (b.title.trim() || b.value.trim()));

  function startDrag(key: HeroLayerKey, e: React.PointerEvent<HTMLDivElement>) {
    if (!canDrag) return;
    const root = rootRef.current;
    if (!root) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const box = el.getBoundingClientRect();
    const container = root.getBoundingClientRect();
    const grabX = e.clientX - box.left;
    const grabY = e.clientY - box.top;

    const move = (ev: PointerEvent) => {
      const maxX = Math.max(0, container.width - box.width);
      const maxY = Math.max(0, container.height - box.height);
      const px = Math.min(maxX, Math.max(0, ev.clientX - container.left - grabX));
      const py = Math.min(maxY, Math.max(0, ev.clientY - container.top - grabY));
      onPositionsChange?.({
        ...pos,
        [key]: { x: (px / container.width) * 100, y: (py / container.height) * 100 },
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /** غلاف عنصر: إمّا في التخطيط الطبيعي أو بموضع حر مطلق. */
  function Layer({
    k,
    className,
    style,
    children,
  }: {
    k: HeroLayerKey;
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
  }) {
    const p = pos[k];
    const dragCls = canDrag ? "cursor-move touch-none outline-dashed outline-1 outline-offset-2 outline-border" : "";
    if (p) {
      return (
        <div
          onPointerDown={(e) => startDrag(k, e)}
          className={`absolute z-10 ${dragCls} ${className ?? ""}`}
          style={{ left: `${p.x}%`, top: `${p.y}%`, ...style }}
        >
          {children}
        </div>
      );
    }
    return (
      <div onPointerDown={(e) => startDrag(k, e)} className={`${dragCls} ${className ?? ""}`} style={style}>
        {children}
      </div>
    );
  }

  /** العناصر التي لها موضع حر تُرسم مباشرة داخل الحاوية بدل التخطيط الطبيعي. */
  const freeKeys = new Set(Object.keys(pos));

  const titleNode =
    banner.show_title && banner.title ? (
      <h1
        className="font-black leading-tight line-clamp-2 md:line-clamp-3"
        style={{ fontSize: `clamp(${banner.title_size_mobile}px, 4vw, ${banner.title_size}px)` }}
      >
        {banner.title}
      </h1>
    ) : null;

  const subtitleNode =
    banner.show_subtitle && banner.subtitle ? (
      <p
        className="text-hero-foreground/70 line-clamp-2 md:line-clamp-3 max-w-md"
        style={{ fontSize: `clamp(${banner.subtitle_size_mobile}px, 2vw, ${banner.subtitle_size}px)` }}
      >
        {banner.subtitle}
      </p>
    ) : null;

  const subtitle2Node =
    banner.show_subtitle2 && banner.subtitle2 ? (
      <p
        className="text-hero-foreground/70 line-clamp-2 md:line-clamp-3 max-w-md"
        style={{ fontSize: `clamp(${banner.subtitle2_size_mobile}px, 2vw, ${banner.subtitle2_size}px)` }}
      >
        {banner.subtitle2}
      </p>
    ) : null;

  const titleEl = titleNode ? <Layer k="title">{titleNode}</Layer> : null;
  const subtitleEl = subtitleNode ? (
    <Layer k="subtitle" style={freeKeys.has("subtitle") ? undefined : { marginTop: banner.gap_title_subtitle }}>
      {subtitleNode}
    </Layer>
  ) : null;
  const subtitle2El = subtitle2Node ? (
    <Layer k="subtitle2" style={freeKeys.has("subtitle2") ? undefined : { marginTop: banner.gap_title_subtitle }}>
      {subtitle2Node}
    </Layer>
  ) : null;

  const buttonEls = buttons.map((b) => (
    <Layer key={b.id} k={`btn:${b.id}`}>
      <HeroButtonItem banner={banner} b={b} />
    </Layer>
  ));

  const badgeEls = badges.map((b) => (
    <Layer key={b.id} k={`bdg:${b.id}`}>
      <BadgeCard b={b} />
    </Layer>
  ));

  const flowButtons = buttons.filter((b) => !freeKeys.has(`btn:${b.id}`));
  const flowBadges = badges.filter((b) => !freeKeys.has(`bdg:${b.id}`));

  const buttonRow = flowButtons.length ? (
    <div
      className={`flex flex-wrap items-center gap-3 ${justifyClass[banner.text_align]}`}
      style={{ marginTop: banner.gap_subtitle_buttons }}
    >
      {buttonEls.filter((_, i) => !freeKeys.has(`btn:${buttons[i]!.id}`))}
    </div>
  ) : null;

  const badgesColumn = flowBadges.length ? (
    <div className="flex flex-col gap-3">{badgeEls.filter((_, i) => !freeKeys.has(`bdg:${badges[i]!.id}`))}</div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className="relative min-h-[152px] h-auto md:h-[230px] overflow-hidden"
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
            style={{
              background: `linear-gradient(90deg, ${banner.overlay_color}f2 0%, ${banner.overlay_color}e6 38%, ${banner.overlay_color}8c 52%, transparent 68%)`,
            }}
          />
          <div
            className="absolute inset-0 hidden md:block"
            style={{ backgroundColor: banner.overlay_color, opacity: banner.overlay_opacity }}
          />
        </>
      )}


      {/* ============= Desktop layout ============= */}
      <div className="hidden md:block relative h-full">
        {/* العناصر ذات المواضع الحرة */}
        {freeKeys.has("title") && titleEl}
        {freeKeys.has("subtitle") && subtitleEl}
        {freeKeys.has("subtitle2") && subtitle2El}
        {buttonEls.filter((_, i) => freeKeys.has(`btn:${buttons[i]!.id}`))}
        {badgeEls.filter((_, i) => freeKeys.has(`bdg:${badges[i]!.id}`))}

        {/* التخطيط الطبيعي لبقية العناصر */}
        <div className="relative h-full grid grid-cols-[auto_minmax(0,1fr)]">
          <div
            className={`relative order-2 p-10 flex flex-col min-w-0 overflow-hidden ${justifyClass[banner.content_position_y]} ${alignClass[banner.content_position_x]}`}
          >
            {!freeKeys.has("title") && titleEl}
            {!freeKeys.has("subtitle") && subtitleEl}
            {!freeKeys.has("subtitle2") && subtitle2El}
            {!sideButtons && buttonRow}
          </div>

          {(badgesColumn || sideButtons) && (
            <div className="order-1 flex flex-col justify-center gap-3 p-6 min-w-0">
              {badgesColumn}
              {sideButtons && buttonRow}
            </div>
          )}
        </div>
      </div>

      {/* ============= Mobile layout — مطابق لتصميم كانفا ============= */}
      <div className="md:hidden relative z-10 min-h-[152px]">
        {/* النص والأزرار على يسار البانر */}
        <div className="absolute inset-y-0 left-0 w-[46%] flex flex-col justify-center gap-1 px-2.5 text-center items-center">
          {banner.show_title && banner.title && (
            <h1 className="font-black leading-tight whitespace-nowrap text-[12px] w-full">{banner.title}</h1>
          )}
          {banner.show_subtitle && banner.subtitle && (
            <p className="text-teal leading-snug line-clamp-2 text-[9px] w-full text-center">{banner.subtitle}</p>
          )}
          {banner.show_subtitle2 && banner.subtitle2 && (
            <p className="text-teal leading-snug line-clamp-2 text-[9px] w-full text-center">{banner.subtitle2}</p>
          )}

          {buttons.length > 0 && (
            <div className="flex flex-nowrap justify-center gap-1.5 mt-1 w-full">
              {buttons.map((b) => (
                <HeroButtonItem key={b.id} banner={banner} b={b} size={22} compact />
              ))}
            </div>
          )}
        </div>

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
