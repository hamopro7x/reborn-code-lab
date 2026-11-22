// RFC 2822 MIME message construction for Gmail messages.send.
import { bytesToB64 } from "./mime-encoding";

const utf8 = (s: string) => new TextEncoder().encode(s);
const b64Utf8 = (s: string) => bytesToB64(utf8(s));
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
