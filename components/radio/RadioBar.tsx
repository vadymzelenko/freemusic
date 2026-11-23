"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Flame, Loader2, Pause, Play, SkipForward, Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n";
import { isSong } from "@/lib/radio/match";
import { useUI } from "@/store/ui";
import { useRadio } from "./RadioProvider";
import { StationLogo } from "./StationLogo";

/** Bottom bar while a station is loaded (phone: above the tab bar; tablet/desktop: full width). */
export function RadioBar() {
  const r = useRadio();
  const pathname = usePathname();
  const toast = useUI((s) => s.showToast);
  const openPlayer = useUI((s) => s.setPlayerOpen);

  // explain every automatic switch
  useEffect(() => {
    const e = r.lastSwitch;
    if (!e) return;
    const why =
      e.kind === "ad"
        ? tx("Реклама — переключили на музыку")
        : e.kind === "talk"
          ? tx("Разговоры — переключили на музыку")
          : e.kind === "disliked"
            ? tx("Пропустили песню, которая вам не нравится")
            : e.kind === "track"
              ? tx("Началась ваша песня")
              : e.kind === "artist"
                ? tx("Начался ваш артист")
                : "";
    if (why) toast(why);
  }, [r.lastSwitch, toast]);

  if (!r.active || !r.station || pathname === "/onboarding") return null;
  const np = r.current;
  const song = isSong(np) ? np : null;
  const sug = r.suggestion;

  return (
    <div
      className="fixed right-0 z-40 px-2 md:!bottom-0 md:border-t md:border-line md:bg-card/95 md:px-0 md:pb-safe md:backdrop-blur-xl"
      style={{ left: "var(--sidebar-w)", bottom: "calc(var(--tabbar-h) + var(--safe-bottom) + 6px)" }}
    >
      <AnimatePresence>
        {sug && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mx-auto mb-1.5 flex max-w-2xl items-center gap-2 rounded-xl bg-amber-400 py-1.5 pr-1.5 pl-3 text-black shadow-lg md:mx-5 md:mt-2 md:mb-0 md:max-w-md"
          >
            {sug.tier >= 2 ? <Flame className="h-4 w-4 shrink-0" /> : <Sparkles className="h-4 w-4 shrink-0" />}
            <div className="min-w-0 flex-1 truncate text-[13px] leading-tight">
              <b>{sug.tier >= 2 ? tx("Ваша песня") : tx("Ваш артист")}:</b> {sug.np.artist} — {sug.np.title}
            </div>
            <button
              type="button"
              onClick={() => void r.playItem(sug)}
              className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-black px-3 text-[13px] font-semibold text-amber-300"
            >
              {r.checking === sug.station.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
              {tx("Слушать")}
            </button>
            <button type="button" onClick={r.dismissSuggestion} className="flex h-8 w-7 shrink-0 items-center justify-center" aria-label={tx("Скрыть")}>
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative mx-auto flex h-[var(--mini-h)] max-w-2xl items-center gap-3 rounded-xl border border-line bg-card/90 pl-2 pr-1 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl md:max-w-none md:rounded-none md:border-0 md:bg-transparent md:px-5 md:shadow-none">
        <button type="button" onClick={() => openPlayer(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <StationLogo station={r.station} className="h-11 w-11 md:h-14 md:w-14" />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight">
              {song ? song.title : np?.kind === "ad" ? tx("Реклама") : r.station.name}
            </div>
            <div className={cn("mt-0.5 flex items-center gap-1.5 truncate text-[12.5px]", r.error ? "text-red-400" : "text-muted")}>
              {r.error ?? (
                <>
                  {r.playing && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />}
                  <span className="truncate">{song ? song.artist : tx("Прямой эфир")}</span>
                </>
              )}
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={r.toggle}
          className="flex h-11 w-11 items-center justify-center rounded-full text-fg active:scale-95 active:bg-fg/10 md:bg-fg md:text-bg"
          aria-label={r.playing ? tx("Пауза") : tx("Играть")}
        >
          {(r.buffering && r.playing) || r.checking ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : r.playing ? (
            <Pause className="h-[22px] w-[22px] fill-current" />
          ) : (
            <Play className="ml-0.5 h-[22px] w-[22px] fill-current" />
          )}
        </button>
        <button
          type="button"
          onClick={r.next}
          className="flex h-11 w-10 items-center justify-center rounded-full text-fg active:scale-95 active:bg-fg/10"
          aria-label={tx("Следующая песня")}
        >
          <SkipForward className="h-5 w-5 fill-current" />
        </button>
      </div>
    </div>
  );
}
