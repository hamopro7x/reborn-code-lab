import { createFileRoute } from "@tanstack/react-router";
import { AGENT_RELEASE } from "@/lib/agent-release";

const TOTAL = AGENT_RELEASE.size;
const PARTS = AGENT_RELEASE.parts as ReadonlyArray<{ path: string; size: number }>;

async function signedUrl(path: string, ttl = 900): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.storage
      .from(AGENT_RELEASE.storageBucket)
      .createSignedUrl(path, ttl);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

// هل الملف الكامل موجود فعلاً على المخزن؟ (الروابط الموقّعة تنجح حتى لو الملف مفقود)
async function wholeFileUrl(): Promise<string | null> {
  const url = await signedUrl(AGENT_RELEASE.storagePath, 300);
  if (!url) return null;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (res.ok && Number(res.headers.get("content-length") ?? 0) === TOTAL) return url;
  } catch {
    /* نتجاهل ونستخدم الأجزاء */
  }
  return null;
}

async function fetchPart(index: number, innerOffset: number): Promise<Response> {
  let lastErr: unknown = null;
  for (let i = 0; i < 5; i++) {
    const url = await signedUrl(PARTS[index]!.path);
    if (url) {
      try {
        const res = await fetch(url, {
          headers: innerOffset > 0 ? { Range: `bytes=${innerOffset}-` } : {},
          redirect: "follow",
        });
        if (res.ok || res.status === 206) return res;
        lastErr = new Error(`part ${index} -> ${res.status}`);
      } catch (err) {
        lastErr = err;
      }
    } else {
      lastErr = new Error(`part ${index} unavailable`);
    }
    await new Promise((r) => setTimeout(r, 400 + i * 400));
  }
  throw lastErr ?? new Error("part failed");
}

function locate(offset: number) {
  let remaining = offset;
  for (let i = 0; i < PARTS.length; i++) {
    const size = PARTS[i]!.size;
    if (remaining < size) return { index: i, innerOffset: remaining };
    remaining -= size;
  }
  return { index: PARTS.length, innerOffset: 0 };
}

function partsStream(start: number) {
  let { index, innerOffset } = locate(start);
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let sentInPart = innerOffset;
  let retries = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        if (index >= PARTS.length) {
          controller.close();
          return;
        }
        try {
          if (!reader) {
            const res = await fetchPart(index, sentInPart);
            if (!res.body) throw new Error("no body");
            reader = res.body.getReader();
            // بعض الخوادم تتجاهل Range وترجع الجزء كاملاً — نتخطى ما أُرسل
            if (sentInPart > 0 && res.status === 200) {
              let skip = sentInPart;
              while (skip > 0) {
                const { done, value } = await reader.read();
                if (done) throw new Error("part ended early");
                if (!value) continue;
                if (value.byteLength <= skip) {
                  skip -= value.byteLength;
                } else {
                  const rest = value.slice(skip);
                  skip = 0;
                  sentInPart += rest.byteLength;
                  retries = 0;
                  controller.enqueue(rest);
                  return;
                }
              }
            }
          }
          const { done, value } = await reader.read();
          if (done) {
            if (sentInPart < PARTS[index]!.size) {
              reader = null;
              if (++retries > 40) throw new Error("stalled");
              continue;
            }
            reader = null;
            index += 1;
            sentInPart = 0;
            continue;
          }
          if (value) {
            sentInPart += value.byteLength;
            retries = 0;
            controller.enqueue(value);
          }
          return;
        } catch (err) {
          reader = null;
          if (++retries > 40) {
            controller.error(err);
            return;
          }
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    },
    cancel() {
      reader?.cancel().catch(() => {});
    },
  });
}

export async function handleAgentDownload(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("method not allowed", { status: 405 });
  }

  // الملف الكامل موجود؟ التحويل المباشر أخف وأسرع.
  const whole = await wholeFileUrl();
  if (whole) {
    return new Response(null, {
      status: 302,
      headers: { location: whole, "cache-control": "no-store" },
    });
  }

  if (!PARTS.length) {
    return new Response("release unavailable", {
      status: 503,
      headers: { "cache-control": "no-store", "retry-after": "10" },
    });
  }

  const headers: Record<string, string> = {
    "content-type": "application/octet-stream",
    "content-disposition": 'attachment; filename="MagProAgent-Setup.exe"',
    "accept-ranges": "bytes",
    "cache-control": "no-store",
  };

  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: { ...headers, "content-length": String(TOTAL) },
    });
  }

  let start = 0;
  const m = /bytes=(\d+)-/.exec(request.headers.get("range") ?? "");
  if (m) start = Number(m[1]);
  if (start >= TOTAL) start = 0;

  const partial = start > 0;
  headers["content-length"] = String(TOTAL - start);
  if (partial) headers["content-range"] = `bytes ${start}-${TOTAL - 1}/${TOTAL}`;

  return new Response(partsStream(start), { status: partial ? 206 : 200, headers });
}

export const Route = createFileRoute("/api/public/agent-download")({
  server: {
    handlers: {
      GET: ({ request }) => handleAgentDownload(request),
      HEAD: ({ request }) => handleAgentDownload(request),
    },
  },
});
