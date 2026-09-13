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
        "fixed bottom-6 left-6 z-40 rounded-full flex items-center justify-center gap-1.5 bg-[#25D366] text-white shadow-lg animate-glow-pulse hover:scale-105 transition-transform font-bold",
        showLabel ? "h-11 pl-3 pr-4" : "size-10",
        className
      )}
      aria-label="واتساب"
    >
      <MessageCircle className="size-5" />
      {showLabel && <span className="text-xs">واتساب</span>}
    </a>
  );
}
