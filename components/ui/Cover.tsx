"use client";

import { Music2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function Cover({
  src,
  alt,
  className,
  rounded = "rounded-md",
  priority = false,
}: {
  src?: string;
  alt: string;
  className?: string;
  rounded?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-white/[0.04]", rounded, className)}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-subtle">
          <Music2 className="h-1/3 w-1/3" strokeWidth={1.5} />
        </div>
      )}
      <div className={cn("pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.06]", rounded)} />
    </div>
  );
}
