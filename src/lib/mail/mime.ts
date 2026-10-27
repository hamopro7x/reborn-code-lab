// Pure helpers for Gmail payload parsing and RFC 2822 message building (no secrets).

export function b64urlToBytes(data: string): Uint8Array {
  const s = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
export function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const utf8 = (s: string) => new TextEncoder().encode(s);
const b64Utf8 = (s: string) => bytesToB64(utf8(s));

export function header(payload: any, name: string): string {
  const h = (payload?.headers ?? []).find((x: any) => String(x.name).toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

export interface ParsedBody {
  text: string | null;
  html: string | null;
  attachments: { attachmentId: string; filename: string; mimeType: string; size: number }[];
}

export function parsePayload(payload: any): ParsedBody {
  const out: ParsedBody = { text: null, html: null, attachments: [] };
  const walk = (p: any) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) {
      out.attachments.push({ attachmentId: p.body.attachmentId, filename: p.filename, mimeType: p.mimeType ?? "", size: p.body.size ?? 0 });
    } else if (p.body?.data) {
      const txt = new TextDecoder().decode(b64urlToBytes(p.body.data));
      if (p.mimeType === "text/plain" && out.text == null) out.text = txt;
      if (p.mimeType === "text/html" && out.html == null) out.html = txt;
    }
    for (const c of p.parts ?? []) walk(c);
  };
  walk(payload);
  return out;
}

export function folderFromLabels(labels: string[]): "inbox" | "sent" | "drafts" | "spam" | "other" | "trash" {
  if (labels.includes("TRASH")) return "trash";
  if (labels.includes("SPAM")) return "spam";
  if (labels.includes("DRAFT")) return "drafts";
  if (labels.includes("SENT")) return "sent";
  if (labels.includes("INBOX")) return "inbox";
  return "other";
}

const encHeader = (v: string) => (/^[\x20-\x7E]*$/.test(v) ? v : `=?UTF-8?B?${b64Utf8(v)}?=`);
const clean = (v: string) => v.replace(/[\r\n]+/g, " ").trim();

export interface OutgoingMail {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
  attachments?: { filename: string; mimeType: string; base64: string }[];
}

/** Returns base64url RFC 2822 message ready for Gmail `messages.send`. */
export function buildRawMessage(m: OutgoingMail): string {
  const lines: string[] = [`From: ${clean(m.from)}`, `To: ${clean(m.to)}`];
  if (m.cc) lines.push(`Cc: ${clean(m.cc)}`);
  lines.push(`Subject: ${encHeader(clean(m.subject))}`, "MIME-Version: 1.0");
  if (m.inReplyTo) lines.push(`In-Reply-To: ${clean(m.inReplyTo)}`);
  if (m.references || m.inReplyTo) lines.push(`References: ${clean([m.references, m.inReplyTo].filter(Boolean).join(" "))}`);
  const bodyB64 = (b64Utf8(m.body).match(/.{1,76}/g) ?? [""]).join("\r\n");
  if (!m.attachments?.length) {
    lines.push('Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", bodyB64);
  } else {
    const boundary = "mgpro_" + Math.random().toString(36).slice(2);
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", bodyB64);
    for (const a of m.attachments) {
      const name = encHeader(clean(a.filename));
      lines.push(`--${boundary}`, `Content-Type: ${clean(a.mimeType || "application/octet-stream")}; name="${name}"`,
        `Content-Disposition: attachment; filename="${name}"`, "Content-Transfer-Encoding: base64", "",
        (a.base64.match(/.{1,76}/g) ?? []).join("\r\n"));
    }
    lines.push(`--${boundary}--`);
  }
  return b64Utf8(lines.join("\r\n")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Wraps untrusted email HTML for a sandboxed iframe: no scripts; https images are allowed. */
export function safeEmailDocument(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<(iframe|object|embed|form|meta|link|base)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:/gi, "$1=$2#");
  const csp = "default-src 'none'; img-src data: cid: https:; style-src 'unsafe-inline'; font-src data:";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{font-family:system-ui,sans-serif;color:#111;background:#fff;margin:12px;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${stripped}</body></html>`;
}

/** Best-effort sender logo URL from email HTML: prefers logo-looking urls, skips tracking pixels, https only. */
export function extractLogoUrl(html: string | null | undefined): string | null {
  if (!html) return null;
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  const isBad = (u: string) => /1x1|pixel|beacon|track|open\.aspx|wf\/open|spacer|blank\.gif|dot\.gif|doubleclick/i.test(u);
  const px = (tag: string) => {
    const m = tag.match(/\b(?:width|height)\s*=\s*["']?(\d{2,4})\b/i) ?? tag.match(/width:\s*(\d{2,4})px/i);
    return m ? Number(m[1]) : 0;
  };
  const cands: { url: string; big: boolean; logo: boolean }[] = [];
  for (const tag of tags) {
    const src = tag.match(/\bsrc\s*=\s*["'](https:\/\/[^"'\s]+)["']/i)?.[1];
    if (!src || isBad(src)) continue;
    const s = px(tag);
    cands.push({
      url: src,
      big: s >= 40 || (!/\b(?:width|height)\s*=/i.test(tag) && !/width:\s*\d+px/i.test(tag)),
      logo: /logo|brand/i.test(src),
    });
  }
  const pick = cands.find((c) => c.logo) ?? cands.find((c) => c.big) ?? cands[0];
  return pick ? pick.url.slice(0, 500) : null;
}
