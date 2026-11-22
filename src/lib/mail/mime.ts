// Stable compatibility facade for existing MIME helper imports.
export { b64urlToBytes, bytesToB64 } from "./mime-encoding";
export { header, parsePayload, folderFromLabels } from "./mime-parse";
export type { ParsedBody } from "./mime-parse";
export { buildRawMessage } from "./mime-compose";
export type { OutgoingMail } from "./mime-compose";
export { safeEmailDocument, extractLogoUrl } from "./mime-sanitize";
