import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_FOOTER,
  FOOTER_KEY,
  FOOTER_QUERY_KEY,
  isInternal,
  isWhatsApp,
  normalizeFooter,
  type FooterLink,
} from "@/lib/footer-config";

function WhatsAppIcon() {
  return (
    <svg className="size-3.5 md:size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function FooterItem({ link }: { link: FooterLink }) {
  if (isWhatsApp(link.href)) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-md bg-[#25D366] px-1.5 py-1 text-[10px] font-bold text-white transition-colors hover:bg-[#20b858] md:gap-2 md:rounded-lg md:px-3 md:py-2 md:text-sm"
      >
        <WhatsAppIcon />
        {link.label}
      </a>
    );
  }
  if (isInternal(link.href)) {
    return <Link to={link.href!}>{link.label}</Link>;
  }
  if (link.href) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" className="hover:text-foreground">
        {link.label}
      </a>
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
        {cfg.columns.map((col, i) => (
          <div key={`${col.title}-${i}`}>
            <h4 className="mb-2 text-[11px] font-bold md:text-base">{col.title}</h4>
            <ul className="space-y-1 text-[11px] text-muted-foreground md:text-sm">
              {col.links.map((l, j) => (
                <li key={`${l.label}-${j}`}>
                  <FooterItem link={l} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {cfg.bottom_text}
      </div>
    </footer>
  );
}
