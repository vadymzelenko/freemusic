"use client";

import { Play } from "lucide-react";
import Link from "next/link";
import { Cover } from "@/components/ui/Cover";
import { Equalizer } from "@/components/ui/Equalizer";
import { usePlayer } from "@/components/player/PlayerProvider";
import { cn } from "@/lib/cn";
import type { AlbumSummary, ArtistSummary, Track } from "@/lib/types";
import { useUI } from "@/store/ui";

export function AlbumCard({ album, width = 148, fluid }: { album: AlbumSummary; width?: number; fluid?: boolean }) {
  return (
    <Link href={`/album/${album.id}`} className="min-w-0 shrink-0 snap-start" style={fluid ? undefined : { width }}>
      <Cover src={album.cover} alt="" className="aspect-square w-full" rounded="rounded-lg" />
      <div className="mt-2 truncate text-[14px] font-medium">{album.title}</div>
      <div className="truncate text-[12.5px] text-muted">
        {[album.kind === "single" ? "Сингл" : album.kind === "ep" ? "EP" : null, album.year, album.artist]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </Link>
  );
}

export function ArtistCircle({ artist, width = 120 }: { artist: ArtistSummary; width?: number }) {
  return (
    <Link href={`/artist/${artist.id}`} className="shrink-0 snap-start text-center" style={{ width }}>
      <Cover src={artist.thumbnail} alt="" className="aspect-square w-full" rounded="rounded-full" />
      <div className="mt-2 truncate text-[13.5px] font-medium">{artist.name}</div>
    </Link>
  );
}

/** Square track card for horizontal shelves. Tap = play the whole row from here. */
export function TrackCard({ track, onPlay, width = 148 }: { track: Track; onPlay: () => void; width?: number }) {
  const { current, isPlaying } = usePlayer();
  const openActions = useUI((s) => s.openActions);
  const active = current?.id === track.id;
  return (
    <div className="shrink-0 snap-start" style={{ width }}>
      <button
        type="button"
        onClick={onPlay}
        onContextMenu={(e) => {
          e.preventDefault();
          openActions(track);
        }}
        className="group relative block w-full text-left"
        aria-label={`Воспроизвести ${track.title}`}
      >
        <Cover src={track.cover} alt="" className="aspect-square w-full" rounded="rounded-lg" />
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 transition-opacity",
            active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          {active ? <Equalizer playing={isPlaying} /> : <Play className="h-8 w-8 fill-fg text-fg" />}
        </div>
      </button>
      <button type="button" onClick={() => openActions(track)} className="block w-full text-left">
        <div className="mt-2 truncate text-[14px] font-medium">{track.title}</div>
        <div className="truncate text-[12.5px] text-muted">{track.artist}</div>
      </button>
    </div>
  );
}

/** Big gradient-ish card used for "mixes". */
export function MixCard({
  title,
  subtitle,
  covers,
  onPlay,
  width = 160,
}: {
  title: string;
  subtitle: string;
  covers: string[];
  onPlay: () => void;
  width?: number;
}) {
  const c = covers.filter(Boolean);
  return (
    <button type="button" onClick={onPlay} className="group shrink-0 snap-start text-left" style={{ width }}>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-line bg-card">
        {c.length >= 4 ? (
          <div className="grid h-full w-full grid-cols-2">
            {c.slice(0, 4).map((src, i) => (
              <Cover key={i} src={src} alt="" className="h-full w-full" rounded="rounded-none" />
            ))}
          </div>
        ) : (
          <Cover src={c[0]} alt="" className="h-full w-full" rounded="rounded-none" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <div className="absolute inset-x-3 bottom-2.5">
          <div className="text-[15px] font-bold leading-tight">{title}</div>
        </div>
        <div className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-fg text-bg opacity-90 shadow-lg transition-transform group-active:scale-90">
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        </div>
      </div>
      <div className="mt-2 line-clamp-2 text-[12.5px] leading-snug text-muted">{subtitle}</div>
    </button>
  );
}
