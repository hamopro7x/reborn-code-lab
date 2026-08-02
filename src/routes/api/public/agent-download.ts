import { createFileRoute } from "@tanstack/react-router";
import { AGENT_RELEASE } from "@/lib/agent-release";

// الملف الذي ينزله الموظف = الإصدار المضمّن في كود الموقع.
// لا يتغير إلا بعد نشر الموقع (Publish changes).
const FALLBACK_UPSTREAM = AGENT_RELEASE.url;

let UPSTREAM: string = FALLBACK_UPSTREAM;

async function resolveUpstream(): Promise<string> {
  return AGENT_RELEASE.url;
}



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

  // تحقق أن الجزء الراجع يبدأ فعلاً من المكان المطلوب (بعض الشبكات/الكاش
  // ترجع 206 من مكان مختلف فيتلف الملف بدون أي رسالة خطأ).
  if (offset > 0 && response.status === 206) {
    const cr = response.headers.get("content-range") ?? "";
    const m = /bytes\s+(\d+)-/.exec(cr);
    if (!m || Number(m[1]) !== offset) {
      await reader.cancel().catch(() => {});
      throw new Error("upstream range mismatch");
    }
  }

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

async function upstreamSize(): Promise<number> {
  // طلب HEAD فقط — بدون تنزيل الملف كاملًا لمجرد معرفة حجمه
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(UPSTREAM, { method: "HEAD", redirect: "follow" });
      const len = res.headers.get("content-length");
      if (res.ok && len) return Number(len);
    } catch {
      /* نحاول مرة أخرى */
    }
    await new Promise((r) => setTimeout(r, 300 + i * 300));
  }
  // احتياطي: لو الأبستريم لا يدعم HEAD نقرأ الترويسة من GET ثم نلغي الجسم
  const res = await fetchFrom(0);
  const len = res.headers.get("content-length");
  res.body?.cancel().catch(() => {});
  return len ? Number(len) : 0;
}

export async function handleAgentDownload(request: Request) {
  // التحويل المباشر إلى مخزن الأصول أكثر ثباتاً من تمرير ملف 100MB عبر
  // دالة الموقع. برامج الموظفين القديمة والجديدة تتبع التحويل تلقائياً.
  if (request.method === "GET" || request.method === "HEAD") {
    return new Response(null, {
      status: 302,
      headers: {
        location: AGENT_RELEASE.url,
        "cache-control": "no-store",
      },
    });
  }
  UPSTREAM = await resolveUpstream();
  const total = await upstreamSize();

  // بدون حجم معروف لا يمكن للبرنامج التحقق من اكتمال الملف، فينتهي بملف
  // ناقص وتثبيت فاشل بصمت. نرفض الطلب ليعيد المحاولة بدل تسليم ملف مشكوك فيه.
  if (!total) {
    return new Response("upstream size unavailable", {
      status: 503,
      headers: { "cache-control": "no-store", "retry-after": "5" },
    });
  }

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
      GET: ({ request }) => handleAgentDownload(request),
      HEAD: ({ request }) => handleAgentDownload(request),
    },
  },
});
