import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function WhatsAppFab({
  phone = "201120373986",
  className,
  showLabel = true,
}: {
  phone?: string;
  className?: string;
  showLabel?: boolean;
}) {
  return (
    <a
      href={`https://wa.me/${phone}`}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "fixed bottom-6 left-6 z-40 rounded-full flex items-center justify-center gap-2 bg-[#25D366] text-white shadow-lg animate-glow-pulse hover:scale-105 transition-transform font-bold",
        showLabel ? "h-14 pl-4 pr-5" : "size-12",
        className
      )}
      aria-label="واتساب"
    >
      <MessageCircle className={showLabel ? "size-6" : "size-5"} />
      {showLabel && <span className="text-sm">واتساب</span>}
    </a>
  );
}
