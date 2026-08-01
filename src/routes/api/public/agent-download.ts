import { createFileRoute } from "@tanstack/react-router";

const UPSTREAM =
  "https://mag-pro1.com/__l5e/assets-v1/55ce2cf7-1152-492c-b364-e7e42165cfcf/MagProAgent-Setup.exe";

const MAX_RETRIES = 40;

async function fetchFrom(offset: number): Promise<Response> {
  let lastErr: unknown = null;
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(UPSTREAM, {
        headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
        redirect: "follow",
      });
      if (res.ok || res.status === 206) return res;
      lastErr = new Error(`upstream ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 400 + i * 400));
  }
  throw lastErr ?? new Error("upstream failed");
}

async function openReaderAt(offset: number) {
  const response = await fetchFrom(offset);
  if (!response.body) throw new Error("no body");

  const reader = response.body.getReader();
  let pending: Uint8Array | null = null;

  // بعض خوادم الأصول تتجاهل Range مؤقتًا وتعيد الملف كاملًا بـ 200.
  // نتجاوز البايتات المحمّلة بدل إرسالها مرة ثانية وإفساد الملف.
  if (offset > 0 && response.status === 200) {
    let remaining = offset;
    while (remaining > 0) {
      const { done, value } = await reader.read();
      if (done) throw new Error("upstream ended before resume offset");
      if (!value) continue;
      if (value.byteLength <= remaining) {
        remaining -= value.byteLength;
      } else {
        pending = value.slice(remaining);
        remaining = 0;
      }
    }
  }

  return { reader, pending };
}

async function handle(request: Request) {
  // حجم الملف من الأبستريم
  const head = await fetchFrom(0);
  const totalHeader = head.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : 0;
  head.body?.cancel();

  const rangeHeader = request.headers.get("range");
  let start = 0;
  if (rangeHeader) {
    const m = /bytes=(\d+)-/.exec(rangeHeader);
    if (m) start = Number(m[1]);
  }
  // توافق مع نسخ البرنامج القديمة: كانت تعيد طلب ملف مؤقت مكتمل أو تالف
  // فتدخل في حلقة HTTP 416. تجاهل الـ Range هنا يجبرها على حذف الملف
  // المؤقت وإعادة تنزيل نسخة نظيفة ثم تثبيتها داخل التطبيق.
  if (total && start >= total) start = 0;

  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "accept-ranges": "bytes",
        ...(total ? { "content-length": String(total) } : {}),
      },
    });
  }

  let offset = start;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let pending: Uint8Array | null = null;
  let retries = 0;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        try {
          if (!reader) {
            const opened = await openReaderAt(offset);
            reader = opened.reader;
            pending = opened.pending;
          }
          if (pending) {
            const value = pending;
            pending = null;
            offset += value.byteLength;
            retries = 0;
            controller.enqueue(value);
            return;
          }
          const { done, value } = await reader.read();
          if (done) {
            if (total && offset < total) {
              // انقطع مبكرًا — نستأنف من مكان التوقف
              reader = null;
              if (++retries > MAX_RETRIES) throw new Error("stalled");
              continue;
            }
            controller.close();
            return;
          }
          if (value) {
            offset += value.byteLength;
            retries = 0;
            controller.enqueue(value);
          }
          return;
        } catch (err) {
          reader = null;
          if (++retries > MAX_RETRIES) {
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

  const partial = start > 0;
  const headers: Record<string, string> = {
    "content-type": "application/octet-stream",
    "content-disposition": 'attachment; filename="MagProAgent-Setup.exe"',
    "accept-ranges": "bytes",
    "cache-control": "no-store",
  };
  if (total) {
    headers["content-length"] = String(total - start);
    if (partial) headers["content-range"] = `bytes ${start}-${total - 1}/${total}`;
  }

  return new Response(stream, { status: partial ? 206 : 200, headers });
}

export const Route = createFileRoute("/api/public/agent-download")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      HEAD: ({ request }) => handle(request),
    },
  },
});
