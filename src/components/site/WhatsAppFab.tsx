import { MessageCircle } from "lucide-react";

export function WhatsAppFab({ phone = "201120373986" }: { phone?: string }) {
  return (
    <a
      href={`https://wa.me/${phone}`}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-6 left-6 z-40 flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
      aria-label="واتساب"
    >
      <MessageCircle className="size-6" />
      <span className="text-sm">واتساب</span>
    </a>
  );
}
