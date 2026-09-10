import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { detectPlatform, detectPlatformFromLabel, PlatformBadge } from "@/components/site/PlatformIcon";
import {
  DEFAULT_FOOTER,
  FOOTER_KEY,
  FOOTER_QUERY_KEY,
  isInternal,
  isWhatsApp,
  normalizeFooter,
  type FooterLink,
} from "@/lib/footer-config";

function FooterItem({ link, compact }: { link: FooterLink; compact?: boolean }) {
  const badgeClass = compact ? "size-[17px]" : "size-7 md:size-8";
  const iconClass = compact ? "size-[12px]" : "size-5 md:size-6";


  if (isInternal(link.href)) {
    return <Link to={link.href!}>{link.label}</Link>;
  }
  if (link.href) {
    const platform = isWhatsApp(link.href) ? "whatsapp" : detectPlatform(link.href);
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 hover:text-foreground md:gap-2"
      >
        <PlatformBadge platform={platform} className={badgeClass} iconClassName={iconClass} />
        {link.label}
      </a>
    );
  }
  const platformFromLabel = detectPlatformFromLabel(link.label);
  if (platformFromLabel) {
    return (
      <span className="inline-flex items-center gap-1.5 md:gap-2">
        <PlatformBadge platform={platformFromLabel} className={badgeClass} iconClassName={iconClass} />
        {link.label}
      </span>
    );
  }
  return <span>{link.label}</span>;
}

export function Footer() {
  const { data } = useQuery({
    queryKey: FOOTER_QUERY_KEY,
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", FOOTER_KEY).maybeSingle();
      return normalizeFooter(data?.value);
    },
    staleTime: 5 * 60_000,
  });
  const cfg = data ?? DEFAULT_FOOTER;

  return (
    <footer className="mt-16 border-t border-border bg-card">
      <div
        className="container mx-auto grid gap-2 px-2 py-8 md:gap-8 md:px-4 md:py-12"
        style={{ gridTemplateColumns: `repeat(${Math.max(cfg.columns.length, 1)}, minmax(0, 1fr))` }}
      >
        {cfg.columns.map((col, i) => {
          const compact = col.title.toLowerCase().includes("منصات");
          return (
            <div key={`${col.title}-${i}`}>
              <h4 className="mb-2 text-[11px] font-bold md:text-base">{col.title}</h4>
              <ul className="space-y-1 text-[11px] text-muted-foreground md:text-sm">
                {col.links.map((l, j) => (
                  <li key={`${l.label}-${j}`}>
                    <FooterItem link={l} compact={compact} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {cfg.bottom_text}
      </div>
    </footer>
  );
}
