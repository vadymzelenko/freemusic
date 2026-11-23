"use client";

import { Ban, Flame, Megaphone, MessageSquare, Pause, Play, Sparkles, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";
import { tx } from "@/lib/i18n";
import type { Match } from "@/lib/radio/match";
import { flag, type NowPlaying, type Station } from "@/lib/radio/types";
import { getJSON } from "@/lib/use-api";
import { useNow } from "@/lib/use-now";
import { useLibrary } from "@/store/library";
import { useRadio } from "./RadioProvider";
import { StationLogo } from "./StationLogo";

export const npLine = (np: NowPlaying | null | undefined) => (np ? `${np.artist ? `${np.artist} — ` : ""}${np.title}` : "");

export function sinceLabel(since: number | null | undefined, now: number): string {
  if (since === undefined) return "";
  if (since === null) return tx("в эфире");
  const s = Math.max(0, Math.round((now - since) / 1000));
  return s < 20 ? tx("только началась") : tx("идёт {t}", { t: formatTime(s) });
}

export const stationMeta = (s: Station) =>
  [s.countrycode ? `${flag(s.countrycode)} ${s.countrycode}` : "", s.tags.slice(0, 2).join(", "), s.bitrate ? `${s.bitrate} kbps` : ""]
    .filter(Boolean)
    .join(" · ");

export function MatchBadge({ m, np }: { m?: Match; np?: NowPlaying | null }) {
  if (np?.kind === "ad")
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-red-400">
        <Megaphone className="h-3 w-3" /> {tx("реклама")}
      </span>
    );
  if (np?.kind === "talk")
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-fg/10 px-2 py-0.5 text-[10.5px] text-subtle">
        <MessageSquare className="h-3 w-3" /> {tx("разговоры")}
      </span>
    );
  if (!m || m.kind === "none") return null;
  if (m.kind === "avoid")
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-fg/10 px-2 py-0.5 text-[10.5px] text-subtle">
        <Ban className="h-3 w-3" /> {tx("не ваше")}
      </span>
    );
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
        m.kind === "track" ? "bg-amber-400 text-black" : "bg-fg/12 text-fg",
      )}
    >
      {m.kind === "track" ? <Flame className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
      {m.kind === "track" ? tx("ваш трек") : tx("ваш артист")}
    </span>
  );
}

export function FavButton({ s, className }: { s: Station; className?: string }) {
  const fav = useLibrary((x) => x.radioFavs.some((f) => f.id === s.id));
  const toggleFav = useLibrary((x) => x.toggleRadioFav);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggleFav(s);
      }}
      className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-subtle hover:text-fg", className)}
      aria-label={fav ? tx("Убрать из моих станций") : tx("В мои станции")}
      aria-pressed={fav}
    >
      <Star className={cn("h-[18px] w-[18px]", fav && "fill-amber-300 text-amber-300")} />
    </button>
  );
}

/**
 * Fetches what's on air for stations that aren't in the provider's scan pool
 * (catalog lists), once they scroll into view.
 */
const lazyNp = new Map<string, { np: NowPlaying | null; at: number }>();
const queue = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function requestNp(id: string) {
  const hit = lazyNp.get(id);
  if (hit && Date.now() - hit.at < 60_000) return;
  queue.add(id);
  flushTimer ??= setTimeout(() => {
    flushTimer = null;
    const ids = [...queue].slice(0, 60);
    ids.forEach((x) => queue.delete(x));
    getJSON<{ items?: Record<string, NowPlaying | null> }>(`/api/radio/nowplaying?ids=${ids.join(",")}`)
      .then((r) => {
        for (const x of ids) lazyNp.set(x, { np: r.items?.[x] ?? null, at: Date.now() });
        listeners.forEach((l) => l());
      })
      .catch(() => {});
    if (queue.size) requestNp([...queue][0]!);
  }, 400);
}

function useLazyNowPlaying(s: Station, known: NowPlaying | null | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const [, bump] = useState(0);
  useEffect(() => {
    if (known !== undefined || s.hls) return;
    const el = ref.current;
    if (!el) return;
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    const io = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) {
          requestNp(s.id);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      listeners.delete(l);
    };
  }, [s.id, s.hls, known]);
  return { ref, np: known !== undefined ? known : lazyNp.get(s.id)?.np };
}

export function StationRow({ s, sub }: { s: Station; sub?: string }) {
  const r = useRadio();
  const now = useNow(5000);
  const { ref, np } = useLazyNowPlaying(s, r.nowPlaying[s.id]);
  const isCur = r.station?.id === s.id;
  const playingHere = isCur && r.playing;
  return (
    <div ref={ref} className={cn("flex items-center gap-3 rounded-xl px-4 py-2.5 md:px-3", isCur && "bg-fg/[0.05]")}>
      <button type="button" onClick={() => (isCur ? r.toggle() : r.tune(s))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="relative">
          <StationLogo station={s} className="h-12 w-12" />
          {isCur && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
              {playingHere ? <Pause className="h-5 w-5 fill-white text-white" /> : <Play className="h-5 w-5 fill-white text-white" />}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-medium">{s.name}</span>
            <MatchBadge m={r.matches[s.id]} np={np} />
          </div>
          <div className="truncate text-[13px] text-muted">
            {np && np.kind !== "ad" ? npLine(np) : <span className="text-subtle">{sub ?? stationMeta(s)}</span>}
          </div>
          {np && r.since[s.id] !== undefined && <div className="text-[11px] text-subtle">{sinceLabel(r.since[s.id], now)}</div>}
        </div>
      </button>
      <FavButton s={s} />
    </div>
  );
}

/** Square tile for horizontal shelves. */
export function StationTile({ s }: { s: Station }) {
  const r = useRadio();
  const np = r.nowPlaying[s.id];
  const isCur = r.station?.id === s.id;
  return (
    <button type="button" onClick={() => (isCur ? r.toggle() : r.tune(s))} className="group w-[132px] shrink-0 snap-start text-left md:w-[156px]">
      <div className="relative">
        <StationLogo station={s} className="aspect-square w-full" rounded="rounded-xl" />
        <div
          className={cn(
            "absolute right-2 bottom-2 flex h-9 w-9 items-center justify-center rounded-full bg-fg text-bg shadow-lg transition-opacity",
            isCur ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          {isCur && r.playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
        </div>
      </div>
      <div className="mt-2 truncate text-[13.5px] font-medium">{s.name}</div>
      <div className="truncate text-[12px] text-subtle">{np && np.kind === "music" ? npLine(np) : stationMeta(s)}</div>
    </button>
  );
}

export function HotCard({ s }: { s: Station }) {
  const r = useRadio();
  const now = useNow(1000);
  const np = r.nowPlaying[s.id];
  const m = r.matches[s.id];
  return (
    <button
      type="button"
      onClick={() => r.tune(s)}
      className="w-[240px] shrink-0 snap-start rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-400/15 to-card p-3 text-left md:w-[280px]"
    >
      <div className="flex items-center gap-2.5">
        <StationLogo station={s} className="h-10 w-10" />
        <div className="min-w-0">
          <div className="truncate text-[13px] text-muted">{s.name}</div>
          <MatchBadge m={m} />
        </div>
      </div>
      <div className="mt-2.5 line-clamp-2 text-[15px] font-semibold leading-snug">{npLine(np)}</div>
      <div className="mt-1 flex items-center justify-between text-[12px] text-subtle">
        <span>{sinceLabel(r.since[s.id], now)}</span>
        <span className="flex items-center gap-1 font-medium text-fg">
          <Play className="h-3 w-3 fill-current" /> {tx("Слушать")}
        </span>
      </div>
    </button>
  );
}

export function Shelf({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-3 px-4 md:px-0">
        <h2 className="text-[19px] font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:px-0">{children}</div>
    </section>
  );
}

export function TileSkeletons({ n = 6 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="w-[132px] shrink-0 md:w-[156px]">
          <div className="skeleton aspect-square rounded-xl" />
          <div className="skeleton mt-2 h-3.5 w-3/4 rounded" />
        </div>
      ))}
    </>
  );
}
