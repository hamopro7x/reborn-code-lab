export type FooterLink = {
  label: string;
  /** رابط داخلي مثل /shop أو رابط خارجي كامل. اتركه فارغًا لنص فقط. */
  href?: string;
};

export type FooterColumn = {
  title: string;
  links: FooterLink[];
};

export type FooterConfig = {
  columns: FooterColumn[];
  bottom_text: string;
};

export const FOOTER_KEY = "footer";
export const FOOTER_QUERY_KEY = ["footer-config"];

export const DEFAULT_FOOTER: FooterConfig = {
  columns: [
    {
      title: "روابط",
      links: [
        { label: "الرئيسية", href: "/" },
        { label: "المتجر", href: "/shop" },
        { label: "تتبع الطلب", href: "/track" },
      ],
    },
    {
      title: "الأقسام",
      links: [
        { label: "الألعاب" },
        { label: "أدوات الذكاء الاصطناعي" },
        { label: "منتجات تصميم" },
        { label: "قوالب كانفا" },
      ],
    },
    {
      title: "تواصل",
      links: [
        { label: "واتساب", href: "https://wa.me/201120373986" },
        { label: "الدعم متاح 24/7" },
      ],
    },
    {
      title: "منصاتنا",
      links: [
        { label: "إنستغرام" },
        { label: "فيسبوك" },
        { label: "تيك توك" },
        { label: "إكس" },
      ],
    },
  ],
  bottom_text: "متجر الاشتراكات الرقمية — جميع الحقوق محفوظة",
};

export function normalizeFooter(value: unknown): FooterConfig {
  const v = (value ?? {}) as Partial<FooterConfig>;
  const columns = Array.isArray(v.columns) ? v.columns : DEFAULT_FOOTER.columns;
  return {
    columns: columns.map((c) => ({
      title: String(c?.title ?? ""),
      links: Array.isArray(c?.links)
        ? c.links.map((l) => ({ label: String(l?.label ?? ""), href: l?.href ? String(l.href) : undefined }))
        : [],
    })),
    bottom_text: typeof v.bottom_text === "string" && v.bottom_text ? v.bottom_text : DEFAULT_FOOTER.bottom_text,
  };
}

export function isWhatsApp(href?: string) {
  return Boolean(href && /wa\.me|whatsapp/i.test(href));
}

export function isInternal(href?: string) {
  return Boolean(href && href.startsWith("/"));
}
