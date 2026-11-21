"use client";

import { tx } from "@/lib/i18n";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { usePathname } from "next/navigation";
import { Cover } from "@/components/ui/Cover";
import { copyTrackName, useHoldRepeat, useLongPress } from "@/lib/use-press";
import { usePlayer, useProgress } from "./PlayerProvider";

function MiniProgress() {
  const { time, duration } = useProgress();
  const pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
  return (
    <div className="absolute inset-x-3 bottom-0 h-[2px] overflow-hidden rounded-full bg-fg/10">
      <div className="h-full bg-fg/90" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function MiniPlayer() {
  const { current, isPlaying, isBuffering, error, toggle, next, prev, seekBy, setPlayerOpen } = usePlayer();
  const copyPress = useLongPress(() => current && copyTrackName(current));
  const prevPress = useHoldRepeat(prev, () => seekBy(-5));
  const nextPress = useHoldRepeat(next, () => seekBy(5));
  const pathname = usePathname();

  return (
    <AnimatePresence>
      {current && pathname !== "/onboarding" && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-0 z-40 px-2 md:hidden"
          style={{ bottom: "calc(var(--tabbar-h) + var(--safe-bottom) + 6px)" }}
        >
          <div className="relative mx-auto flex h-[var(--mini-h)] max-w-2xl items-center gap-3 rounded-xl border border-line bg-card/90 pl-2 pr-1 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              {...copyPress}
              onClick={() => setPlayerOpen(true)}
              aria-label={tx("Открыть плеер")}
            >
              <Cover src={current.cover} alt="" className="h-11 w-11" rounded="rounded-[7px]" />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium leading-tight">{current.title}</div>
                {error ? (
                  <div className="truncate text-[12.5px] text-red-400" title={error}>
                    {error}
                  </div>
                ) : (
                  <div className="truncate text-[12.5px] text-muted">{current.artist}</div>
                )}
              </div>
            </button>
            <button
              type="button"
              {...prevPress}
              className="flex h-11 w-9 items-center max-[380px]:hidden justify-center rounded-full text-fg active:scale-95 active:bg-fg/10"
              aria-label={tx("Предыдущий")}
            >
              <SkipBack className="h-[18px] w-[18px] fill-current" />
            </button>
            <button
              type="button"
              onClick={toggle}
              className="flex h-11 w-11 items-center justify-center rounded-full text-fg active:scale-95 active:bg-fg/10"
              aria-label={isPlaying ? tx("Пауза") : tx("Играть")}
            >
              {isBuffering && isPlaying ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-[22px] w-[22px] fill-current" />
              ) : (
                <Play className="ml-0.5 h-[22px] w-[22px] fill-current" />
              )}
            </button>
            <button
              type="button"
              {...nextPress}
              className="flex h-11 w-9 items-center justify-center rounded-full text-fg active:scale-95 active:bg-fg/10"
              aria-label={tx("Следующий")}
            >
              <SkipForward className="h-5 w-5 fill-current" />
            </button>
            <MiniProgress />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
