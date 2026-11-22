// Gmail payload decoding, message header access, and folder classification.
import { b64urlToBytes } from "./mime-encoding";

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
