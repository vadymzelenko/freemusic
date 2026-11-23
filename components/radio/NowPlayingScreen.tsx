"use client";

import { AnimatePresence, motion, useDragControls } from "framer-motion";
import {
  ChevronDown,
  Loader2,
  Megaphone,
  MessageSquare,
  MicVocal,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";
import { tx } from "@/lib/i18n";
import { isSong, songTrack } from "@/lib/radio/match";
import { pseudoFrequency, type NowPlaying } from "@/lib/radio/types";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-now";
import { useLibrary, useReaction } from "@/store/library";
import { useUI } from "@/store/ui";
import { useRadio } from "./RadioProvider";
import { FavButton, HotCard, sinceLabel } from "./StationRow";
import { StationLogo } from "./StationLogo";

type MetaTrack = { cover: string; duration: number; album: string } | null;

/** Song cover + duration from Deezer (metadata only). */
export function useSongMeta(np: NowPlaying | null | undefined) {
  const song = isSong(np) ? np : null;
  const meta = useApi<{ track: MetaTrack }>(
    song ? `/api/meta/track?artist=${encodeURIComponent(song.artist)}&title=${encodeURIComponent(song.title)}` : null,
  );
  return song ? (meta.data?.track ?? null) : null;
}

function parseLrc(lrc: string): { t: number; line: string }[] {
  const out: { t: number; line: string }[] = [];
  for (const row of lrc.split("\n")) {
    const m = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/.exec(row.trim());
    if (m) out.push({ t: Number(m[1]) * 60 + Number(m[2]), line: m[3]!.trim() });
  }
  return out;
}

function Lyrics({ np, since, duration }: { np: NowPlaying; since: number | null | undefined; duration: number }) {
  const q = `/api/lyrics?artist=${encodeURIComponent(np.artist)}&title=${encodeURIComponent(np.title)}${duration ? `&duration=${duration}` : ""}`;
  const { data, loading } = useApi<{ synced?: string; plain?: string; instrumental?: boolean }>(q);
  const now = useNow(500);
  const lines = useMemo(() => (data?.synced ? parseLrc(data.synced) : []), [data?.synced]);
  // we only know where we are in the song if we saw it start
  const elapsed = since ? (now - since) / 1000 : null;
  const cur = elapsed !== null && lines.length ? lines.findLastIndex((l) => l.t <= elapsed) : -1;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-i="${cur}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [cur]);

  if (loading) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-subtle" />;
  if (data?.instrumental) return <p className="mt-10 text-center text-muted">{tx("Инструментал")}</p>;
  if (!data?.synced && !data?.plain) return <p className="mt-10 text-center text-muted">{tx("Текст не найден")}</p>;
  if (lines.length && elapsed !== null)
    return (
      <div ref={box} className="space-y-3 py-[30vh] text-[22px] font-bold leading-snug">
        {lines.map((l, i) => (
          <p key={i} data-i={i} className={cn("transition-colors", i === cur ? "text-fg" : "text-fg/30")}>
            {l.line || "♪"}
          </p>
        ))}
      </div>
    );
  return (
    <div className="whitespace-pre-line py-6 text-[17px] font-semibold leading-relaxed text-fg/80">
      {data.plain ?? lines.map((l) => l.line).join("\n")}
    </div>
  );
}

function Reactions({ np, cover, duration }: { np: NowPlaying; cover: string; duration: number }) {
  const track = useMemo(() => songTrack(np, { cover, duration }), [np, cover, duration]);
  const reaction = useReaction(track.id);
  const like = useLibrary((s) => s.toggleLike);
  const dislike = useLibrary((s) => s.toggleDislike);
  const toast = useUI((s) => s.showToast);
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => {
          dislike(track);
          if (reaction !== -1) toast(tx("Больше не будем переключать на эту песню"));
        }}
        className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-fg"
        aria-label={tx("Не нравится")}
        aria-pressed={reaction === -1}
      >
        <ThumbsDown className={cn("h-[22px] w-[22px]", reaction === -1 && "fill-current text-fg")} />
      </button>
      <button
        type="button"
        onClick={() => {
          like(track);
          if (reaction !== 1) toast(tx("Сохранено. Поймаем её в эфире ещё раз"));
        }}
        className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-fg"
        aria-label={tx("Нравится")}
        aria-pressed={reaction === 1}
      >
        <ThumbsUp className={cn("h-[22px] w-[22px]", reaction === 1 && "fill-current text-fg")} />
      </button>
    </div>
  );
}

export function NowPlayingScreen() {
  const open = useUI((s) => s.playerOpen);
  const setOpen = useUI((s) => s.setPlayerOpen);
  const r = useRadio();
  const now = useNow(1000);
  const smart = useLibrary((s) => s.radioSmart);
  const setSmart = useLibrary((s) => s.setRadioSmart);
  const prefs = useLibrary((s) => s.radioPrefs);
  const setPrefs = useLibrary((s) => s.setRadioPrefs);
  const [lyrics, setLyrics] = useState(false);
  const drag = useDragControls();
  const np = r.current;
  const meta = useSongMeta(np);
  const s = r.station;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (!s) setOpen(false);
  }, [s, setOpen]);

  const hot = r.ranked.filter((x) => x.id !== s?.id && (r.matches[x.id]?.score ?? 0) >= 50).slice(0, 6);
  const song = isSong(np) ? np : null;

  return (
    <AnimatePresence>
      {open && s && (
        <motion.div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[55] overflow-hidden bg-bg"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 32, stiffness: 320 }}
          drag="y"
          dragListener={false}
          dragControls={drag}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.6 }}
          onDragEnd={(_, i) => {
            if (i.offset.y > 140 || i.velocity.y > 600) setOpen(false);
          }}
        >
          {/* blurred backdrop from the artwork */}
          {meta?.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meta.cover} alt="" className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-3xl" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/70 to-bg" />

          <div className="no-scrollbar relative mx-auto flex h-full max-w-xl flex-col overflow-y-auto px-6 pt-safe pb-safe">
            <header className="flex h-14 shrink-0 touch-none items-center gap-2" onPointerDown={(e) => drag.start(e)}>
              <button type="button" onClick={() => setOpen(false)} className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full" aria-label={tx("Свернуть")}>
                <ChevronDown className="h-7 w-7" />
              </button>
              <div className="min-w-0 flex-1 text-center">
                <div className="font-mono text-[12px] font-semibold tracking-widest text-amber-300">{pseudoFrequency(s.id)} FM</div>
                <div className="truncate text-[13px] font-medium text-muted">{s.name}</div>
              </div>
              <FavButton s={s} className="-mr-2 h-10 w-10" />
            </header>

            {lyrics && song ? (
              <div className="min-h-0 flex-1">
                <Lyrics np={song} since={r.since[s.id]} duration={meta?.duration ?? 0} />
              </div>
            ) : (
              <div className="flex flex-1 flex-col justify-center py-4">
                <div className="relative mx-auto aspect-square w-full max-w-[340px]">
                  {meta?.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={meta.cover} alt="" className="h-full w-full rounded-2xl object-cover shadow-[0_20px_60px_rgba(0,0,0,0.5)]" />
                  ) : (
                    <StationLogo station={s} className="h-full w-full shadow-[0_20px_60px_rgba(0,0,0,0.5)]" rounded="rounded-2xl" />
                  )}
                  {meta?.cover && (
                    <StationLogo station={s} className="absolute -bottom-3 -left-3 h-14 w-14 shadow-xl ring-4 ring-bg" rounded="rounded-xl" />
                  )}
                </div>
              </div>
            )}

            <div className="shrink-0 pt-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[12px] font-semibold">
                    {r.behindLive > 5 ? (
                      <span className="rounded bg-fg/10 px-1.5 py-0.5 tabular-nums text-muted">−{formatTime(r.behindLive)}</span>
                    ) : (
                      <span className="flex items-center gap-1 rounded bg-red-500/90 px-1.5 py-0.5 tracking-wide text-white">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
                      </span>
                    )}
                    {np?.kind === "ad" && (
                      <span className="flex items-center gap-1 text-red-400">
                        <Megaphone className="h-3.5 w-3.5" /> {tx("Реклама")}
                      </span>
                    )}
                    {np?.kind === "talk" && (
                      <span className="flex items-center gap-1 text-muted">
                        <MessageSquare className="h-3.5 w-3.5" /> {tx("Разговорный эфир")}
                      </span>
                    )}
                    {song && <span className="font-normal text-subtle">{sinceLabel(r.since[s.id], now)}</span>}
                  </div>
                  <h2 className="mt-1.5 line-clamp-2 text-[24px] font-bold leading-tight tracking-tight">
                    {song ? song.title : np?.kind === "ad" ? tx("Рекламная пауза") : np?.title || s.name}
                  </h2>
                  <p className="mt-0.5 truncate text-[16px] text-muted">
                    {song ? song.artist : r.error ? <span className="text-red-400">{r.error}</span> : s.tags.slice(0, 3).join(" · ") || tx("Прямой эфир")}
                  </p>
                </div>
                {song && <Reactions np={song} cover={meta?.cover ?? ""} duration={meta?.duration ?? 0} />}
              </div>

              {/* transport */}
              <div className="mt-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => r.seekBack(30)}
                  disabled={!r.rewindWindow}
                  className="flex h-12 w-12 items-center justify-center rounded-full text-fg disabled:opacity-25"
                  aria-label={tx("Назад на 30 секунд")}
                  title={r.rewindWindow ? tx("Назад на 30 секунд") : tx("Эта станция не даёт перематывать")}
                >
                  <RotateCcw className="h-6 w-6" />
                </button>
                <button type="button" onClick={() => r.step(-1)} className="flex h-14 w-14 items-center justify-center rounded-full text-fg active:scale-95" aria-label={tx("Предыдущая станция")}>
                  <SkipBack className="h-8 w-8 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={r.toggle}
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-fg text-bg shadow-xl active:scale-95"
                  aria-label={r.playing ? tx("Пауза") : tx("Играть")}
                >
                  {r.buffering && r.playing ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                  ) : r.playing ? (
                    <Pause className="h-8 w-8 fill-current" />
                  ) : (
                    <Play className="ml-1 h-8 w-8 fill-current" />
                  )}
                </button>
                <button type="button" onClick={() => r.step(1)} className="flex h-14 w-14 items-center justify-center rounded-full text-fg active:scale-95" aria-label={tx("Следующая станция")}>
                  <SkipForward className="h-8 w-8 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={() => setLyrics((v) => !v)}
                  disabled={!song}
                  className={cn("flex h-12 w-12 items-center justify-center rounded-full disabled:opacity-25", lyrics ? "bg-fg/15 text-fg" : "text-fg")}
                  aria-label={tx("Текст песни")}
                  aria-pressed={lyrics}
                >
                  <MicVocal className="h-6 w-6" />
                </button>
              </div>
              {r.behindLive > 5 && (
                <button type="button" onClick={r.goLive} className="mx-auto mt-2 block text-[13px] font-semibold text-red-400">
                  {tx("Вернуться в прямой эфир")}
                </button>
              )}

              {/* smart switches */}
              <div className="mt-6 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSmart(!smart)}
                  aria-pressed={smart}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[12.5px] leading-tight transition-colors",
                    smart ? "border-amber-300/50 bg-amber-300/15 text-fg" : "border-line text-muted",
                  )}
                >
                  <Sparkles className={cn("h-5 w-5 shrink-0", smart && "text-amber-300")} />
                  <span>
                    <b className="block text-[13px]">{tx("Умное радио")}</b>
                    {tx("ловит ваши песни")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrefs({ skipAds: !prefs.skipAds })}
                  aria-pressed={prefs.skipAds}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[12.5px] leading-tight transition-colors",
                    prefs.skipAds ? "border-red-400/40 bg-red-500/10 text-fg" : "border-line text-muted",
                  )}
                >
                  <Megaphone className={cn("h-5 w-5 shrink-0", prefs.skipAds && "text-red-400")} />
                  <span>
                    <b className="block text-[13px]">{tx("Без рекламы")}</b>
                    {tx("переключаем на музыку")}
                  </span>
                </button>
              </div>

              {hot.length > 0 && !lyrics && (
                <section className="mt-7 mb-4">
                  <h3 className="mb-2 text-[14px] font-semibold text-muted">{tx("Сейчас в эфире для вас")}</h3>
                  <div className="no-scrollbar -mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-1">
                    {hot.map((x) => (
                      <HotCard key={x.id} s={x} />
                    ))}
                  </div>
                </section>
              )}
              <div className="h-6" />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
