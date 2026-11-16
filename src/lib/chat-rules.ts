export const CHAT_MAX_BYTES = 25 * 1024 * 1024;
export const CHAT_EDIT_WINDOW_MS = 60 * 60 * 1000;
export const CHAT_BUCKET = "site-assets";

const mediaTypes: Record<string, string[]> = {
  jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"], gif: ["image/gif"], webp: ["image/webp"],
  mp4: ["video/mp4"], webm: ["video/webm", "audio/webm"], mov: ["video/quicktime"],
  mp3: ["audio/mpeg"], wav: ["audio/wav", "audio/x-wav"], ogg: ["audio/ogg"], m4a: ["audio/mp4", "audio/x-m4a"],
  pdf: ["application/pdf"], txt: ["text/plain"], csv: ["text/csv", "text/plain"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  zip: ["application/zip", "application/x-zip-compressed"],
};

export function validateChatFile(name: string, mime: string, bytes: Uint8Array) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!mediaTypes[ext]?.includes(mime) || bytes.length === 0 || bytes.length > CHAT_MAX_BYTES) {
    throw new Error("نوع الملف غير مسموح أو حجمه أكبر من 25 ميجابايت");
  }
  const starts = (...values: number[]) => values.every((v, i) => bytes[i] === v);
  const ascii = new TextDecoder().decode(bytes.subarray(0, 512));
  if (starts(0x4d, 0x5a) || starts(0x7f, 0x45, 0x4c, 0x46) || /^\s*(#!|<\?php|<!doctype\s+html|<html|<script|<svg)/i.test(ascii)) {
    throw new Error("ملف قابل للتنفيذ أو محتوى غير آمن");
  }
  const signatures: Record<string, boolean> = {
    jpg: starts(0xff, 0xd8, 0xff), jpeg: starts(0xff, 0xd8, 0xff), png: starts(137, 80, 78, 71, 13, 10, 26, 10),
    gif: ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a"),
    webp: ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP",
    pdf: ascii.startsWith("%PDF-"), mp4: ascii.slice(4, 8) === "ftyp", mov: ascii.slice(4, 8) === "ftyp",
    m4a: ascii.slice(4, 8) === "ftyp", webm: starts(0x1a, 0x45, 0xdf, 0xa3),
    ogg: ascii.startsWith("OggS"), wav: ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE",
    mp3: ascii.startsWith("ID3") || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0),
    zip: starts(0x50, 0x4b, 0x03, 0x04), docx: starts(0x50, 0x4b, 0x03, 0x04),
    xlsx: starts(0x50, 0x4b, 0x03, 0x04), pptx: starts(0x50, 0x4b, 0x03, 0x04),
  };
  if (signatures[ext] === false || (["txt", "csv"].includes(ext) && bytes.includes(0))) {
    throw new Error("محتوى الملف لا يطابق نوعه");
  }
  // Documents and archives are download-only. They are never rendered as HTML or executed.
  return { extension: ext, inline: /^(image|audio|video)\//.test(mime) };
}

export function canEditChatMessage(sender: string, viewer: string, createdAt: string, now: number) {
  const age = now - Date.parse(createdAt);
  return sender === viewer && age >= 0 && age <= CHAT_EDIT_WINDOW_MS;
}

export function chatLinks(text: string) {
  return text.split(/(https?:\/\/[^\s<>]+)/g).map((part) => ({ text: part, url: /^https?:\/\//i.test(part) ? part : null }));
}

export type ChatMember = { id: string; name: string; role: string };
export type ChatAttachment = { id: string; name: string; mime: string; size: number; url?: string };
export type ChatMessage = {
  id: string; sender_id: string; sender_name: string; body: string; created_at: string; edited_at: string | null;
  mandatory: boolean; deleted_at: string | null; attachments: ChatAttachment[];
  mentions: string[]; mandatory_mentions?: string[] | null; poll: { question: string; options: string[]; multiple: boolean } | null;
  votes: { user_id: string; name: string; choices: number[]; voted_at: string }[];
};
export type ChatState = {
  enabled: boolean; userId: string; role: string; owner: boolean; open: boolean;
  members: ChatMember[]; pending: ChatMessage[]; notifications: { message_id: string; body: string }[];
  targetedMandatory?: boolean;
  incoming?: { id: string; created_at: string } | null;
};