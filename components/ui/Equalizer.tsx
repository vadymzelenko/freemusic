import { cn } from "@/lib/cn";

export function Equalizer({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <span className={cn("flex h-3.5 items-end gap-[2px]", className)} aria-hidden>
      {[0, 0.2, 0.4].map((d) => (
        <span
          key={d}
          className={cn("eq-bar block h-full w-[3px] rounded-full bg-fg", !playing && "[animation-play-state:paused]")}
          style={{ animationDelay: `${d}s` }}
        />
      ))}
    </span>
  );
}
