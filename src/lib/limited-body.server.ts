export class BodyLimitError extends Error {
  constructor() { super("Request body too large"); }
}
/** Count bytes as they arrive, not after an unbounded request.text()/json() allocation. */
export async function readLimitedBody(request: Request, limit: number): Promise<string> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) throw new BodyLimitError();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new BodyLimitError();
      }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}