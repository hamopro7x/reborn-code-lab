import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type MailListRowProps = {
  sender: string;
  subject: ReactNode;
  preview: string;
  account: string;
  date: string;
  logo?: string;
  read?: boolean;
  onOpen: () => void;
  onToggleRead?: () => void;
  footer?: ReactNode;
};

function AvatarLogo({ src, fallback }: { src: string; fallback: string }) {
  const [err, setErr] = useState(false);
  if (err) return <>{fallback}</>;
  return <img src={src} alt="" className="h-full w-full rounded-full bg-white object-contain p-0.5" onError={() => setErr(true)} />;
}

/** Single-line RTL row: every element sits on one line, nothing wraps below. */
export function MailListRow({ sender, subject, preview, account, date, logo, read = true, onOpen, onToggleRead, footer }: MailListRowProps) {
  return (
    <li dir="rtl" className={`flex items-center gap-2 px-3 py-2 hover:bg-muted/50 ${read ? "" : "bg-primary/5"}`}>
      <Button variant="ghost" onClick={onOpen}
        className="h-auto min-w-0 flex-1 items-center justify-start gap-3 rounded-none p-0 text-right font-normal whitespace-nowrap hover:bg-transparent">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-lg text-muted-foreground">
          {logo ? <AvatarLogo src={logo} fallback={Array.from(sender.trim())[0]?.toLocaleUpperCase() || "?"} /> : Array.from(sender.trim())[0]?.toLocaleUpperCase() || "?"}
        </span>
        <span dir="auto" className={`w-32 shrink-0 truncate text-right text-sm sm:w-40 ${read ? "" : "font-bold"}`}>{sender}</span>
        <span dir="auto" className={`shrink-0 truncate text-sm ${read ? "text-muted-foreground" : "font-semibold"}`}>{subject}</span>
        <span dir="auto" className="min-w-0 flex-1 truncate text-right text-sm text-muted-foreground">{preview || "\u00a0"}</span>
        <span dir="ltr" className="hidden w-44 shrink-0 truncate text-left text-[11px] text-primary/80 md:block">{account}</span>
        <time className="shrink-0 text-left text-xs text-muted-foreground">{date}</time>
      </Button>
      {onToggleRead && (
        <Button variant="ghost" size="icon" onClick={onToggleRead}
          title={read ? "تعليم كغير مقروء" : "تعليم كمقروء"}
          aria-label={read ? "تعليم كغير مقروء" : "تعليم كمقروء"}
          className="h-5 w-4 shrink-0 rounded-none p-0">
          <span className={`h-2 w-2 rounded-full ${read ? "bg-transparent" : "bg-primary"}`} />
        </Button>
      )}
      {footer}
    </li>
  );
}
