"use client";

import { AnimatePresence, motion, useDragControls } from "framer-motion";
import {
  ChevronDown,
  Heart,
  ListMusic,
  ListPlus,
  Loader2,
  Pause,
  Play,
  Radio,
  SkipBack,
  SkipForward,
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Cover } from "@/components/ui/Cover";
import { cn } from "@/lib/cn";
import { useLibrary } from "@/store/library";
import { useUI } from "@/store/ui";
import { usePlayer } from "./PlayerProvider";
import { Scrubber } from "./Scrubber";

export function FullPlayer() {
  const {
    current,
    queue,
    index,
    isPlaying,
    isBuffering,
    radio,
    setRadio,
    toggle,
    next,
    prev,
    playerOpen,
    setPlayerOpen,
  } = usePlayer();
  const liked = useLibrary((s) => (current ? s.likedIds.includes(current.id) : false));
  const toggleLike = useLibrary((s) => s.toggleLike);
  const openPicker = useUI((s) => s.openPlaylistPicker);
  const toast = useUI((s) => s.showToast);
  const dragControls = useDragControls();

  const close = () => setPlayerOpen(false);

  // Lock background scroll while open.
  useEffect(() => {
    if (!playerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPlayerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [playerOpen, setPlayerOpen]);

  const upNext = queue[index + 1];

  return (
    <AnimatePresence>
      {playerOpen && current && (
        <motion.div
          key="full-player"
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 36, stiffness: 340, mass: 0.9 }}
          drag="y"
          dragListener={false}
          dragControls={dragControls}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.7 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 120 || info.velocity.y > 600) close();
          }}
        >
          {/* Ambient blurred background */}
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <AnimatePresence mode="popLayout">
              <motion.img
                key={current.cover}
                src={current.cover}
                alt=""
                referrerPolicy="no-referrer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.55 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8 }}
                className="absolute left-1/2 top-[-10%] h-[80%] w-[160%] max-w-none -translate-x-1/2 scale-125 object-cover blur-[90px] saturate-150"
              />
            </AnimatePresence>
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-bg/70 to-bg" />
          </div>

          <div className="relative mx-auto flex h-full w-full max-w-md flex-col px-6 pt-safe pb-safe">
            {/* Header — drag handle area */}
            <div
              className="flex touch-none items-center justify-between pt-3 pb-2"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <button
                type="button"
                onClick={close}
                className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-fg/90 active:bg-white/10"
                aria-label="Свернуть"
              >
                <ChevronDown className="h-6 w-6" />
              </button>
              <div className="text-center">
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                  {radio ? "Радио" : "Сейчас играет"}
                </div>
                {current.album && <div className="max-w-[200px] truncate text-xs text-fg/80">{current.album}</div>}
              </div>
              <Link
                href="/queue"
                onClick={close}
                className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-fg/90 active:bg-white/10"
                aria-label="Очередь"
              >
                <ListMusic className="h-5 w-5" />
              </Link>
            </div>

            {/* Artwork */}
            <div
              className="flex flex-1 touch-none items-center justify-center py-4"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <motion.div
                className="relative aspect-square w-full max-w-[min(100%,46dvh)]"
                animate={{ scale: isPlaying ? 1 : 0.86 }}
                transition={{ type: "spring", damping: 22, stiffness: 220 }}
              >
                <Cover
                  src={current.cover}
                  alt={current.title}
                  priority
                  className="h-full w-full shadow-[0_24px_80px_-12px_rgba(0,0,0,0.75)]"
                  rounded="rounded-2xl"
                />
                <AnimatePresence>
                  {isBuffering && isPlaying && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="skeleton absolute inset-0 rounded-2xl !bg-black/30"
                    />
                  )}
                </AnimatePresence>
              </motion.div>
            </div>

            {/* Title + like */}
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[22px] font-semibold leading-tight tracking-tight">{current.title}</h2>
                <p className="truncate text-[17px] text-muted">{current.artist}</p>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.85 }}
                onClick={() => toggleLike(current)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-white/[0.04]"
                aria-label={liked ? "Убрать из любимых" : "Нравится"}
                aria-pressed={liked}
              >
                <Heart className={cn("h-5 w-5 transition-colors", liked ? "fill-fg text-fg" : "text-fg/80")} />
              </motion.button>
            </div>

            {/* Timeline */}
            <div className="mt-5">
              <Scrubber />
            </div>

            {/* Transport */}
            <div className="mt-3 flex items-center justify-between px-4">
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={prev}
                className="flex h-14 w-14 items-center justify-center rounded-full text-fg"
                aria-label="Предыдущий"
              >
                <SkipBack className="h-8 w-8 fill-current" />
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={toggle}
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-fg text-bg shadow-lg"
                aria-label={isPlaying ? "Пауза" : "Играть"}
              >
                {isBuffering && isPlaying ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-8 w-8 fill-current" />
                ) : (
                  <Play className="ml-1 h-8 w-8 fill-current" />
                )}
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={next}
                className="flex h-14 w-14 items-center justify-center rounded-full text-fg"
                aria-label="Следующий"
              >
                <SkipForward className="h-8 w-8 fill-current" />
              </motion.button>
            </div>

            {/* Secondary actions */}
            <div className="mt-5 mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setRadio(!radio);
                  toast(radio ? "Бесконечное радио выключено" : "Бесконечное радио включено");
                }}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                  radio ? "border-fg/80 bg-fg text-bg" : "border-line text-muted hover:text-fg",
                )}
                aria-pressed={radio}
              >
                <Radio className="h-4 w-4" />
                Радио
              </button>
              <div className="min-w-0 flex-1 px-3 text-center text-[12px] text-subtle">
                {upNext ? (
                  <span className="block truncate">
                    Далее: <span className="text-muted">{upNext.title}</span>
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => openPicker(current)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted hover:text-fg"
                aria-label="Добавить в плейлист"
              >
                <ListPlus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
