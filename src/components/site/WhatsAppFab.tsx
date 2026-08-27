import { MessageCircle } from "lucide-react";

export function WhatsAppFab({ phone = "201120373986" }: { phone?: string }) {
  return (
    <a
      href={`https://wa.me/${phone}`}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-6 left-6 z-40 h-14 pl-4 pr-5 rounded-full flex items-center justify-center gap-2 bg-[#25D366] text-white shadow-lg animate-glow-pulse hover:scale-105 transition-transform font-bold"
      aria-label="واتساب"
    >
      <MessageCircle className="size-6" />
      <span className="text-sm">واتساب</span>
    </a>
  );
}
