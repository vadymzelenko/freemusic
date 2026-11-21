"use client";

import { useRef, useState } from "react";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePlayer, useProgress } from "./PlayerProvider";

export function Scrubber() {
  const { seek } = usePlayer();
  const { time, duration, buffered } = useProgress();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);

  const d = duration > 0 ? duration : 0;
  const shown = dragValue ?? time;
  const pct = d ? Math.min(100, (shown / d) * 100) : 0;
  const bufPct = d ? Math.min(100, (buffered / d) * 100) : 0;

  const valueAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !d) return 0;
    const r = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * d;
  };

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Позиция"
        aria-valuemin={0}
        aria-valuemax={Math.round(d)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={formatTime(shown)}
        className="group relative flex h-6 cursor-pointer touch-none items-center"
        onPointerDown={(e) => {
          if (!d) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragValue(valueAt(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragValue !== null) setDragValue(valueAt(e.clientX));
        }}
        onPointerUp={(e) => {
          if (dragValue === null) return;
          seek(valueAt(e.clientX));
          setDragValue(null);
        }}
        onPointerCancel={() => setDragValue(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") seek(time + 5);
          if (e.key === "ArrowLeft") seek(time - 5);
        }}
      >
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-full bg-white/10 transition-[height] duration-150",
            dragValue !== null ? "h-2" : "h-1 group-hover:h-1.5",
          )}
        >
          <div className="absolute inset-y-0 left-0 bg-white/15" style={{ width: `${bufPct}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-fg" style={{ width: `${pct}%` }} />
        </div>
        <div
          className={cn(
            "pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg shadow transition-transform duration-150",
            dragValue !== null ? "scale-100" : "scale-0 group-hover:scale-100",
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-medium tabular-nums text-subtle">
        <span>{formatTime(shown)}</span>
        <span>-{formatTime(Math.max(0, d - shown))}</span>
      </div>
    </div>
  );
}
