"use client";

import {
  ChevronUp,
  ListMusic,
  Loader2,
  MicVocal,
  Pause,
  Play,
  Radio,
  SkipBack,
  SkipForward,
  ThumbsUp,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import Link from "next/link";
import { Cover } from "@/components/ui/Cover";
import { cn } from "@/lib/cn";
import { copyTrackName, useHoldRepeat, useLongPress } from "@/lib/use-press";
import { useLibrary } from "@/store/library";
import { useUI } from "@/store/ui";
import { usePlayer } from "./PlayerProvider";
import { Scrubber } from "./Scrubber";

/** Bottom player bar for tablets and desktops (replaces the mini player + tab bar). */
export function PlayerBar() {
  const {
    current,
    isPlaying,
    isBuffering,
    error,
    toggle,
    next,
    prev,
    seekBy,
    radio,
    setRadio,
    volume,
    setVolume,
    setPlayerOpen,
  } = usePlayer();
  const liked = useLibrary((s) => (current ? s.likedIds.includes(current.id) : false));
  const toggleLike = useLibrary((s) => s.toggleLike);
  const setLyricsOpen = useUI((s) => s.setLyricsOpen);
  const copyPress = useLongPress(() => current && copyTrackName(current));
  const prevPress = useHoldRepeat(prev, () => seekBy(-5));
  const nextPress = useHoldRepeat(next, () => seekBy(5));

  if (!current) return null;
  const VolIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      className="fixed right-0 bottom-0 z-40 hidden border-t border-line bg-card/95 pb-safe backdrop-blur-xl md:block"
      style={{ left: "var(--sidebar-w)" }}
    >
      <div className="flex h-[84px] items-center gap-4 px-4 lg:px-5">
        {/* track */}
        <div className="flex min-w-0 flex-1 items-center gap-3 lg:w-[30%] lg:flex-none">
          <button type="button" onClick={() => setPlayerOpen(true)} className="shrink-0" aria-label="Открыть плеер">
            <Cover src={current.cover} alt="" className="h-14 w-14" rounded="rounded-md" />
          </button>
          <div className="min-w-0" {...copyPress}>
            <div className="truncate text-[14px] font-medium">{current.title}</div>
            {error ? (
              <div className="truncate text-[12.5px] text-red-400" title={error}>
                {error}
              </div>
            ) : current.artistId ? (
              <Link href={`/artist/${current.artistId}`} className="block truncate text-[12.5px] text-muted hover:text-fg hover:underline">
                {current.artist}
              </Link>
            ) : (
              <div className="truncate text-[12.5px] text-muted">{current.artist}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => toggleLike(current)}
            className="ml-1 hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-fg lg:flex"
            aria-label="Нравится"
            aria-pressed={liked}
          >
            <ThumbsUp className={cn("h-[18px] w-[18px]", liked && "fill-fg text-fg")} />
          </button>
        </div>

        {/* transport + timeline */}
        <div className="flex flex-col items-center md:flex-none lg:flex-1">
          <div className="flex items-center gap-2">
            <button type="button" {...prevPress} className="flex h-10 w-10 items-center justify-center rounded-full text-fg hover:bg-fg/10" aria-label="Предыдущий">
              <SkipBack className="h-5 w-5 fill-current" />
            </button>
            <button
              type="button"
              onClick={toggle}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-fg text-bg transition-transform active:scale-95"
              aria-label={isPlaying ? "Пауза" : "Играть"}
            >
              {isBuffering && isPlaying ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              )}
            </button>
            <button type="button" {...nextPress} className="flex h-10 w-10 items-center justify-center rounded-full text-fg hover:bg-fg/10" aria-label="Следующий">
              <SkipForward className="h-5 w-5 fill-current" />
            </button>
          </div>
          <div className="hidden w-full max-w-[560px] lg:block">
            <Scrubber compact />
          </div>
        </div>

        {/* extras */}
        <div className="flex items-center justify-end gap-1 lg:w-[30%]">
          <button
            type="button"
            onClick={() => setRadio(!radio)}
            className={cn("flex h-9 w-9 items-center justify-center rounded-full", radio ? "text-fg" : "text-subtle hover:text-fg")}
            aria-label="Радио"
            aria-pressed={radio}
          >
            <Radio className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => {
              setLyricsOpen(true);
              setPlayerOpen(true);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-subtle hover:text-fg"
            aria-label="Текст песни"
          >
            <MicVocal className="h-[18px] w-[18px]" />
          </button>
          <Link href="/queue" className="flex h-9 w-9 items-center justify-center rounded-full text-subtle hover:text-fg" aria-label="Очередь">
            <ListMusic className="h-[18px] w-[18px]" />
          </Link>
          <div className="ml-1 hidden items-center gap-2 lg:flex">
            <button
              type="button"
              onClick={() => setVolume(volume > 0 ? 0 : 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-subtle hover:text-fg"
              aria-label="Громкость"
            >
              <VolIcon className="h-[18px] w-[18px]" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="vol w-24"
              style={{ ["--p" as string]: `${volume * 100}%` }}
              aria-label="Громкость"
            />
          </div>
          <button
            type="button"
            onClick={() => setPlayerOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-subtle hover:text-fg"
            aria-label="Развернуть"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
        </div>
      </div>
      {/* thin progress on tablets (scrubber is hidden there) */}
      <div className="absolute inset-x-0 top-0 lg:hidden">
        <TabletProgress />
      </div>
    </div>
  );
}

function TabletProgress() {
  return (
    <div className="-mt-[5px]">
      <Scrubber compact hideTimes />
    </div>
  );
}
