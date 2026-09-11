import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function SafeImage({
  src,
  alt,
  className,
  fallbackClassName,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & { fallbackClassName?: string }) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => setFailed(!src), [src]);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-2 bg-muted px-2 text-center text-muted-foreground",
          fallbackClassName,
        )}
      >
        <ImageOff className="size-6 opacity-60" aria-hidden="true" />
        <span className="line-clamp-2 text-xs font-bold">{alt}</span>
      </div>
    );
  }

  return <img {...props} src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}