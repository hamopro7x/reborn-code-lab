import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { safeEmailDocument } from "@/lib/mail/mime";

/** Keep the email hidden until its images and final document height are ready. */
export function MailMessageBody({ html }: { html: string }) {
  const document = useMemo(() => safeEmailDocument(html), [html]);
  const [ready, setReady] = useState(false);
  const observer = useRef<ResizeObserver | null>(null);
  const frame = useRef<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const done = useRef(false);

  // onLoad can fire before React attaches it; also never leave a spinner forever.
  useEffect(() => {
    const el = iframeRef.current;
    if (el && el.contentDocument?.readyState === "complete" && el.contentDocument.body?.childNodes.length) loaded(el);
    const t = window.setTimeout(() => { if (iframeRef.current) loaded(iframeRef.current); setReady(true); }, 2500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document]);

  useEffect(() => () => {
    observer.current?.disconnect();
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const loaded = (iframe: HTMLIFrameElement) => {
    const doc = iframe.contentDocument;
    if (!doc?.body || done.current) return;
    done.current = true;
    const resize = () => {
      // Remove the previous viewport height from scrollHeight before measuring.
      iframe.style.height = "1px";
      iframe.style.height = `${Math.ceil(Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight))}px`;
    };
    resize();
    observer.current?.disconnect();
    observer.current = new ResizeObserver(() => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(resize);
    });
    observer.current.observe(doc.body);
    frame.current = requestAnimationFrame(() => {
      resize();
      setReady(true);
    });
  };

  return (
    <div className="relative" aria-busy={!ready}>
      {!ready && (
        <div role="status" aria-label="تحميل الرسالة" className="flex min-h-36 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="email"
        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
        scrolling="no"
        className={`w-full rounded-md border border-border bg-background ${ready ? "block" : "invisible absolute inset-x-0 top-0"}`}
        srcDoc={document}
        onLoad={(event) => loaded(event.currentTarget)}
      />
    </div>
  );
}