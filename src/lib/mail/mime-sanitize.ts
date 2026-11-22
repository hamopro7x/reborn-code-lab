// Defensive rendering helpers for untrusted email HTML and sender branding.
/** Wraps untrusted email HTML for a sandboxed iframe: no scripts; https images are allowed. */
export function safeEmailDocument(html: string): string {
  const stripped = html
    .replace(/<script[\\s\\S]*?<\\/script>/gi, "")
    .replace(/<(iframe|object|embed|form|meta|link|base)[^>]*>/gi, "")
    .replace(/\\son\\w+\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)/gi, "")
    .replace(/(href|src)\\s*=\\s*(["']?)\\s*javascript:/gi, "$1=$2#");
  const csp = "default-src 'none'; img-src data: cid: https:; style-src 'unsafe-inline'; font-src data:";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{font-family:system-ui,sans-serif;color:#111;background:#fff;margin:12px;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${stripped}</body></html>`;
}

/** Best-effort sender logo URL from email HTML: prefers logo-looking urls, skips tracking pixels, https only. */
export function extractLogoUrl(html: string | null | undefined): string | null {
  if (!html) return null;
  const tags = html.match(/<img\\b[^>]*>/gi) ?? [];
  const isBad = (u: string) => /1x1|pixel|beacon|track|open\\.aspx|wf\\/open|spacer|blank\\.gif|dot\\.gif|doubleclick/i.test(u);
  const px = (tag: string) => {
    const m = tag.match(/\\b(?:width|height)\\s*=\\s*["']?(\\d{2,4})\\b/i) ?? tag.match(/width:\\s*(\\d{2,4})px/i);
    return m ? Number(m[1]) : 0;
  };
  const cands: { url: string; big: boolean; logo: boolean }[] = [];
  for (const tag of tags) {
    const src = tag.match(/\\bsrc\\s*=\\s*["'](https:\\/\\/[^"'\\s]+)["']/i)?.[1];
    if (!src || isBad(src)) continue;
    const s = px(tag);
    cands.push({
      url: src,
      big: s >= 40 || (!/\\b(?:width|height)\\s*=/i.test(tag) && !/width:\\s*\\d+px/i.test(tag)),
      logo: /logo|brand/i.test(src),
    });
  }
  const pick = cands.find((c) => c.logo) ?? cands.find((c) => c.big) ?? cands[0];
  return pick ? pick.url.slice(0, 500) : null;
}
