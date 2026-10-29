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
  starred?: boolean;
  onOpen: () => void;
  onToggleRead?: () => void;
  footer?: ReactNode;
};

function AvatarLogo({ src, fallback }: { src: string; fallback: string }) {
  const [err, setErr] = useState(false);
  if (err) return <>{fallback}</>;
  return <img src={src} alt="" className="h-full w-full rounded-full bg-white object-contain p-0.5" onError={() => setErr(true)} />;
}

/** Physical RTL tracks stay fixed independently of the message text direction. */
export function MailListRow({ sender, subject, preview, account, date, logo, read = true, onOpen, onToggleRead, footer }: MailListRowProps) {
  return (
    <li dir="rtl" className={`grid grid-cols-[minmax(0,1fr)_104px] gap-x-3 p-3 hover:bg-muted/50 sm:grid-cols-[minmax(0,1fr)_144px] ${read ? "" : "bg-primary/5"}`}>
      <Button variant="ghost" onClick={onOpen}
        className="col-start-1 row-start-1 h-auto min-w-0 items-start justify-start rounded-none p-0 text-right font-normal whitespace-normal hover:bg-transparent">
        <span className="grid w-full min-w-0 grid-cols-[40px_minmax(0,1fr)] gap-x-3">
          <span aria-hidden="true" className="col-start-1 row-span-4 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-lg text-muted-foreground">
            {logo ? <AvatarLogo src={logo} fallback={Array.from(sender.trim())[0]?.toLocaleUpperCase() || "?"} /> : Array.from(sender.trim())[0]?.toLocaleUpperCase() || "?"}
          </span>
          <span dir="auto" className={`col-start-2 block h-5 min-w-0 truncate text-right text-sm leading-5 ${read ? "" : "font-bold"}`}>{sender}</span>
          <span dir="auto" className={`col-start-2 mt-1 block h-5 min-w-0 truncate text-right text-sm leading-5 ${read ? "text-muted-foreground" : "font-semibold"}`}>{subject}</span>
          <span dir="auto" className="col-start-2 mt-1 block h-5 min-w-0 truncate text-right text-sm leading-5 text-muted-foreground">{preview || "\u00a0"}</span>
          <span dir="ltr" className="col-start-2 mt-1 block h-4 min-w-0 truncate text-right text-[11px] leading-4 text-primary/80">{account}</span>
        </span>
      </Button>
      <div className="col-start-2 row-start-1 grid min-w-0 grid-rows-[44px_24px_20px] justify-items-end">
        <div className="flex w-full items-start justify-end gap-2">
          <time className="min-w-0 text-left text-xs leading-5 text-muted-foreground">{date}</time>
          {onToggleRead && (
            <Button variant="ghost" size="icon" onClick={onToggleRead}
              title={read ? "تعليم كغير مقروء" : "تعليم كمقروء"}
              aria-label={read ? "تعليم كغير مقروء" : "تعليم كمقروء"}
              className="h-5 w-4 shrink-0 rounded-none p-0">
              <span className={`h-2 w-2 rounded-full ${read ? "bg-transparent" : "bg-primary"}`} />
            </Button>
          )}
        </div>
        {footer}
      </div>
    </li>
  );
}