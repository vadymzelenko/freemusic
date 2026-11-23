"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { Station } from "@/lib/radio/types";

function hue(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

/** Station favicon, or a warm gradient tile with initials when there's none / it fails. */
export function StationLogo({ station, className, rounded = "rounded-lg" }: { station: Station; className?: string; rounded?: string }) {
  const [failed, setFailed] = useState(false);
  const h = hue(station.id);
  const initials = station.name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      className={cn("relative flex shrink-0 items-center justify-center overflow-hidden", rounded, className)}
      style={{ background: `linear-gradient(135deg, hsl(${h} 55% 38%), hsl(${(h + 40) % 360} 60% 22%))` }}
    >
      {station.favicon && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={station.favicon}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full bg-white object-contain"
        />
      ) : (
        <span className="text-[13px] font-bold tracking-wide text-white/90">{initials || "FM"}</span>
      )}
      <div className={cn("pointer-events-none absolute inset-0 ring-1 ring-inset ring-fg/10", rounded)} />
    </div>
  );
}
