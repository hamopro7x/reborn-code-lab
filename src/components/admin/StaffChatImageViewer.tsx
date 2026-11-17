import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatLocaleDateTime } from "@/lib/format";
import { viewerIndex, viewerKeyAction, viewerStep } from "@/lib/chat-viewer";
import type { ChatAttachment } from "@/lib/chat-rules";

/**
 * WhatsApp-style full-screen picture viewer: it opens inside the site, never in a
 * new tab. Click the picture to zoom, the dark edge to close, arrows to move.
 */
export function StaffChatImageViewer({ images, index, caption, sender, createdAt, onClose }: {
  images: ChatAttachment[]; index: number; caption?: string; sender?: string; createdAt?: string; onClose: () => void;
}) {
  const [current, setCurrent] = useState(() => viewerIndex(index, images.length));
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => { setZoomed(false); }, [current]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = viewerKeyAction(event.key);
      if (!action) return;
      event.preventDefault();
      if (action === "close") onClose();
      else if (action === "next") setCurrent((old) => viewerStep(old, images.length, 1));
      else setCurrent((old) => viewerStep(old, images.length, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

  // Neighbours are fetched ahead so moving between pictures feels instant.
  useEffect(() => {
    images.forEach((image, position) => {
      if (image.url && Math.abs(position - current) === 1) { const pre = new Image(); pre.src = image.url; }
    });
  }, [images, current]);

  const item = images[current];
  if (!item?.url) return null;
  const step = (direction: -1 | 1) => setCurrent((old) => viewerStep(old, images.length, direction));

  return createPortal(<div className="staff-chat-viewer" dir="rtl" role="dialog" aria-modal="true" aria-label="عرض الصورة">
    <header className="staff-chat-viewer-bar">
      <div className="staff-chat-viewer-sender">
        <span className="staff-chat-viewer-avatar" aria-hidden="true">{sender?.trim().slice(0, 1) || "م"}</span>
        <div className="min-w-0">
          <p className="truncate text-sm">{sender || "صورة"}</p>
          {createdAt && <time className="staff-chat-viewer-date" dateTime={createdAt}>{formatLocaleDateTime(createdAt, "ar-EG", { dateStyle: "short", timeStyle: "short" })}</time>}
        </div>
      </div>
      <div className="staff-chat-viewer-tools" dir="ltr">
        <Button variant="ghost" size="icon" aria-label="إغلاق عرض الصورة" title="إغلاق" onClick={onClose}><X className="size-5" /></Button>
        <Button asChild variant="ghost" size="icon" aria-label="تنزيل الصورة" title="تنزيل">
          <a href={item.url} download={item.name}><Download className="size-5" /></a>
        </Button>
        <Button variant="ghost" size="icon" aria-label="تكبير الصورة" title="تكبير" disabled={zoomed} onClick={() => setZoomed(true)}><ZoomIn className="size-5" /></Button>
        <Button variant="ghost" size="icon" aria-label="تصغير الصورة" title="تصغير" disabled={!zoomed} onClick={() => setZoomed(false)}><ZoomOut className="size-5" /></Button>
      </div>
    </header>
    <div className={`staff-chat-viewer-stage${zoomed ? " is-zoomed" : ""}`} onClick={onClose}>
      {images.length > 1 && <Button variant="ghost" size="icon" className="staff-chat-viewer-nav is-prev" aria-label="الصورة السابقة" title="السابقة"
        onClick={(event) => { event.stopPropagation(); step(-1); }}><ChevronLeft className="size-6" /></Button>}
      <img src={item.url} alt={item.name} className={zoomed ? "is-zoomed" : ""} title={zoomed ? "تصغير" : "تكبير"}
        onClick={(event) => { event.stopPropagation(); setZoomed((old) => !old); }} />
      {images.length > 1 && <Button variant="ghost" size="icon" className="staff-chat-viewer-nav is-next" aria-label="الصورة التالية" title="التالية"
        onClick={(event) => { event.stopPropagation(); step(1); }}><ChevronRight className="size-6" /></Button>}
    </div>
    {images.length > 1 && <span className="staff-chat-viewer-count" dir="ltr">{current + 1} / {images.length}</span>}
    {caption?.trim() && <p className="staff-chat-viewer-caption" dir="rtl">{caption}</p>}
  </div>, document.body);
}
