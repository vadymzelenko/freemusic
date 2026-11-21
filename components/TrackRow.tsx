"use client";

import { MoreHorizontal } from "lucide-react";
import { memo } from "react";
import { Cover } from "@/components/ui/Cover";
import { Equalizer } from "@/components/ui/Equalizer";
import { usePlayer } from "@/components/player/PlayerProvider";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Track } from "@/lib/types";
import { useUI } from "@/store/ui";

interface Props {
  track: Track;
  onPlay: () => void;
  index?: number;
  dimmed?: boolean;
  trailing?: React.ReactNode;
}

export const TrackRow = memo(function TrackRow({ track, onPlay, index, dimmed, trailing }: Props) {
  const { current, isPlaying } = usePlayer();
  const openActions = useUI((s) => s.openActions);
  const active = current?.id === track.id;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-lg px-4 py-2 transition-colors active:bg-white/[0.04] md:hover:bg-white/[0.03]",
        dimmed && "opacity-50",
      )}
    >
      <button
        type="button"
        onClick={onPlay}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        aria-label={`Воспроизвести ${track.title}`}
      >
        {typeof index === "number" && (
          <span className="w-5 shrink-0 text-center text-xs tabular-nums text-subtle">{index + 1}</span>
        )}
        <div className="relative">
          <Cover src={track.cover} alt="" className="h-12 w-12" />
          {active && (
            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/50">
              <Equalizer playing={isPlaying} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-[15px] font-medium leading-tight", active ? "text-fg" : "text-fg/95")}>
            {track.title}
          </div>
          <div className="mt-0.5 truncate text-[13px] text-muted">
            {track.artist}
            {track.album ? <span className="text-subtle"> · {track.album}</span> : null}
          </div>
        </div>
        {track.duration > 0 && (
          <span className="hidden shrink-0 text-xs tabular-nums text-subtle sm:block">{formatTime(track.duration)}</span>
        )}
      </button>
      {trailing}
      <button
        type="button"
        onClick={() => openActions(track)}
        className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-fg active:bg-white/10"
        aria-label="Действия"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
    </div>
  );
});
