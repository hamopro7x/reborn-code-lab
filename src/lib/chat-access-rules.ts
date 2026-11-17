const continuation = new Set(["saveMyTxnEntry", "saveMyManualTxn", "saveMyManualCardTxn", "saveTransferNote"]);
export function chatGateExempt(filename: string, name: string) {
  return filename.replaceAll("\\", "/").endsWith("/chat.functions.ts") ||
    (filename.replaceAll("\\", "/").endsWith("/courses.functions.ts") && name === "checkDevice") ||
    (filename.replaceAll("\\", "/").endsWith("/work.functions.ts") && continuation.has(name));
}