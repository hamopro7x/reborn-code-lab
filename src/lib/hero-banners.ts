// نظام بنرات الصفحة الرئيسية — أنواع + قيم افتراضية مطابقة للتصميم الحالي.
import {
  ArrowLeft,
  Zap,
  Percent,
  Package,
  ShoppingCart,
  Truck,
  ShieldCheck,
  Star,
  Gift,
  CreditCard,
  Headphones,
  Clock,
  type LucideIcon,
} from "lucide-react";

export const HERO_ICONS: Record<string, LucideIcon> = {
  ArrowLeft,
  Zap,
  Percent,
  Package,
  ShoppingCart,
  Truck,
  ShieldCheck,
  Star,
  Gift,
  CreditCard,
  Headphones,
  Clock,
};

export const HERO_ICON_KEYS = ["none", ...Object.keys(HERO_ICONS)];

export function heroIcon(name?: string | null): LucideIcon | null {
  if (!name || name === "none") return null;
  return HERO_ICONS[name] ?? null;
}

export type HeroButton = {
  id: string;
  enabled: boolean;
  label: string;
  url: string;
  icon: string; // "none" أو مفتاح من HERO_ICONS
  variant: "primary" | "teal" | "outline";
};

export type HeroBadgeItem = {
  id: string;
  enabled: boolean;
  title: string;
  value: string;
  icon: string;
  color: string;
};

export type HeroMediaType = "image" | "video" | "color" | "none";

export type HeroMediaFit = "cover" | "contain";

/** مفاتيح العناصر القابلة للتحريك الحر داخل البانر (title / subtitle / subtitle2 / btn:id / bdg:id). */
export type HeroLayerKey = string;

/** موضع حر بالنسبة المئوية من أبعاد البانر. */
export type HeroPos = { x: number; y: number };

export type HeroPositions = Partial<Record<HeroLayerKey, HeroPos>>;

export const HERO_LAYER_LABELS: Record<string, string> = {
  title: "العنوان",
  subtitle: "الوصف",
  subtitle2: "الوصف الثاني",
};

export type HeroBanner = {
  id: string;
  title: string;
  show_title: boolean;
  subtitle: string;
  show_subtitle: boolean;
  subtitle2: string;
  show_subtitle2: boolean;
  media_type: HeroMediaType;
  media_fit: HeroMediaFit;
  media_url: string | null;
  media_path: string | null;
  poster_url: string | null;
  poster_path: string | null;
  background_color: string | null;
  video_autoplay: boolean;
  video_muted: boolean;
  video_loop: boolean;
  overlay_enabled: boolean;
  overlay_color: string;
  overlay_opacity: number;
  content_position_x: "start" | "center" | "end";
  content_position_y: "start" | "center" | "end";
  text_align: "start" | "center" | "end";
  buttons_position: "inline" | "side";
  gap_title_subtitle: number;
  gap_subtitle_buttons: number;
  title_size: number;
  title_size_mobile: number;
  subtitle_size: number;
  subtitle_size_mobile: number;
  subtitle2_size: number;
  subtitle2_size_mobile: number;
  button_size: number;
  buttons: HeroButton[];
  badges: HeroBadgeItem[];
  positions: HeroPositions;
  sort_order: number;
  active: boolean;
};

export function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultButtons(): HeroButton[] {
  return [
    { id: newId("btn"), enabled: true, label: "تسوق الآن", url: "/shop", icon: "ArrowLeft", variant: "primary" },
    { id: newId("btn"), enabled: true, label: "تتبع طلبك", url: "/track", icon: "none", variant: "teal" },
  ];
}

export function defaultBadges(): HeroBadgeItem[] {
  return [
    { id: newId("bdg"), enabled: true, title: "تسليم فوري", value: "بعد الدفع مباشرة", icon: "Zap", color: "#2f7ef7" },
  ];
}

/** القيم الافتراضية = التصميم الحالي للموقع بالضبط. */
export const HERO_DEFAULTS: Omit<HeroBanner, "id"> = {
  title: "متجر الاشتراكات الرقمية",
  show_title: true,
  subtitle: "اشتراكات وأدوات وقوالب جاهزة للاستخدام مع ضمان حقيقي وتسليم فوري.",
  show_subtitle: true,
  subtitle2: "",
  show_subtitle2: false,
  media_type: "image",
  media_fit: "cover",
  media_url: null,
  media_path: null,
  poster_url: null,
  poster_path: null,
  background_color: null,
  video_autoplay: true,
  video_muted: true,
  video_loop: true,
  overlay_enabled: true,
  overlay_color: "#05070f",
  overlay_opacity: 0.35,
  // في اتجاه RTL، "start" = اليمين، "end" = اليسار.
  // النص الافتراضي يظهر على اليمين، والأيقونات تُضاف على اليسار في HeroBannerView.
  content_position_x: "start",
  content_position_y: "center",
  text_align: "start",
  buttons_position: "inline",
  gap_title_subtitle: 16,
  gap_subtitle_buttons: 16,
  title_size: 36,
  title_size_mobile: 24,
  subtitle_size: 16,
  subtitle_size_mobile: 14,
  subtitle2_size: 16,
  subtitle2_size_mobile: 14,
  button_size: 44,
  buttons: [],
  badges: [],
  positions: {},
  sort_order: 0,
  active: true,
};

/** تطبيع المواضع الحرة: نسب مئوية بين 0 و100 فقط. */
export function normalizePositions(raw: any): HeroPositions {
  const out: HeroPositions = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of Object.keys(raw)) {
    const p = raw[k];
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      out[k] = { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
    }
  }
  return out;
}

function num(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** تطبيع صف قاعدة البيانات إلى HeroBanner آمن (fallback لأي قيمة ناقصة). */
export function normalizeBanner(row: any): HeroBanner {
  const buttons: HeroButton[] = Array.isArray(row?.buttons)
    ? row.buttons.map((b: any, i: number) => ({
        id: String(b?.id ?? `btn-${i}`),
        enabled: b?.enabled !== false,
        label: String(b?.label ?? ""),
        url: String(b?.url ?? "/shop"),
        icon: String(b?.icon ?? "none"),
        variant: (["primary", "teal", "outline"].includes(b?.variant) ? b.variant : "primary") as HeroButton["variant"],
      }))
    : [];
  const badges: HeroBadgeItem[] = Array.isArray(row?.badges)
    ? row.badges.map((b: any, i: number) => ({
        id: String(b?.id ?? `bdg-${i}`),
        enabled: b?.enabled !== false,
        title: String(b?.title ?? ""),
        value: String(b?.value ?? ""),
        icon: String(b?.icon ?? "Package"),
        color: String(b?.color ?? "#2f7ef7"),
      }))
    : [];
  const d = HERO_DEFAULTS;
  return {
    id: String(row?.id ?? newId("hero")),
    title: String(row?.title ?? d.title),
    show_title: row?.show_title !== false,
    subtitle: String(row?.subtitle ?? d.subtitle),
    show_subtitle: row?.show_subtitle !== false,
    subtitle2: String(row?.subtitle2 ?? ""),
    show_subtitle2: row?.show_subtitle2 === true,
    media_type: (["image", "video", "color", "none"].includes(row?.media_type) ? row.media_type : d.media_type) as HeroMediaType,
    media_fit: (row?.media_fit === "contain" ? "contain" : "cover") as HeroMediaFit,
    media_url: row?.media_url ?? null,
    media_path: row?.media_path ?? null,
    poster_url: row?.poster_url ?? null,
    poster_path: row?.poster_path ?? null,
    background_color: row?.background_color ?? null,
    video_autoplay: row?.video_autoplay !== false,
    video_muted: row?.video_muted !== false,
    video_loop: row?.video_loop !== false,
    overlay_enabled: row?.overlay_enabled !== false,
    overlay_color: String(row?.overlay_color ?? d.overlay_color),
    overlay_opacity: num(row?.overlay_opacity, d.overlay_opacity),
    content_position_x: (["start", "center", "end"].includes(row?.content_position_x) ? row.content_position_x : d.content_position_x) as HeroBanner["content_position_x"],
    content_position_y: (["start", "center", "end"].includes(row?.content_position_y) ? row.content_position_y : d.content_position_y) as HeroBanner["content_position_y"],
    text_align: (["start", "center", "end"].includes(row?.text_align) ? row.text_align : d.text_align) as HeroBanner["text_align"],
    buttons_position: (row?.buttons_position === "side" ? "side" : "inline") as HeroBanner["buttons_position"],
    gap_title_subtitle: num(row?.gap_title_subtitle, d.gap_title_subtitle),
    gap_subtitle_buttons: num(row?.gap_subtitle_buttons, d.gap_subtitle_buttons),
    title_size: num(row?.title_size, d.title_size),
    title_size_mobile: num(row?.title_size_mobile, d.title_size_mobile),
    subtitle_size: num(row?.subtitle_size, d.subtitle_size),
    subtitle_size_mobile: num(row?.subtitle_size_mobile, d.subtitle_size_mobile),
    subtitle2_size: num(row?.subtitle2_size, d.subtitle2_size),
    subtitle2_size_mobile: num(row?.subtitle2_size_mobile, d.subtitle2_size_mobile),
    button_size: num(row?.button_size, d.button_size),
    buttons,
    badges,
    positions: normalizePositions(row?.positions),
    sort_order: num(row?.sort_order, 0),
    active: row?.active !== false,
  };
}

export function blankBanner(sortOrder: number): HeroBanner {
  return {
    ...HERO_DEFAULTS,
    id: newId("new"),
    buttons: defaultButtons(),
    badges: defaultBadges(),
    sort_order: sortOrder,
  };
}

/** الحقول التي تُحفظ في قاعدة البيانات (بدون id). */
export function bannerToRow(b: HeroBanner) {
  const { id, ...rest } = b;
  return rest;
}

export function isInternalUrl(url: string) {
  return url.startsWith("/");
}
