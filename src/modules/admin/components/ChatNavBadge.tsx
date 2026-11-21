import { useChatBadge } from "@/lib/chat-badge";

/** Compact unread-message indicator for the admin sidebar. */
export function ChatNavBadge() {
  const count = useChatBadge();
  if (!count) return null;

  return (
    <span className="ms-auto min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}
