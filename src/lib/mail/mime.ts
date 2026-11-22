// Stable compatibility facade for existing MIME helper imports.
export { b64urlToBytes, bytesToB64 } from "./mime-encoding";
export { header, ParsedBody, parsePayload, folderFromLabels } from "./mime-parse";
export { OutgoingMail, buildRawMessage } from "./mime-compose";
export { safeEmailDocument, extractLogoUrl } from "./mime-sanitize";
