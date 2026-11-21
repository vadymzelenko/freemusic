"use client";

import { tx } from "@/lib/i18n";
import { Play, Search as SearchIcon, Shuffle } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { DownloadAllButton } from "@/components/DownloadAllButton";
import { TrackRow } from "@/components/TrackRow";
import { TrackListSkeleton } from "@/components/ui/Skeleton";
import { usePlayer } from "@/components/player/PlayerProvider";
import { tracksWord } from "@/lib/plural";
import type { Track } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function ArtistSongsPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useApi<{ name: string; tracks: Track[] }>(`/api/artist/songs?id=${encodeURIComponent(id)}`);
  const { playTracks, setRadio } = usePlayer();
  const [filter, setFilter] = useState("");

  const all = data?.tracks ?? [];
  const tracks = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? all.filter((t) => `${t.title} ${t.album ?? ""}`.toLowerCase().includes(f)) : all;
  }, [all, filter]);

  const play = (i: number, shuffle = false) => {
    if (!tracks.length) return;
    setRadio(true);
    playTracks(shuffle ? [...tracks].sort(() => Math.random() - 0.5) : tracks, i);
  };

  return (
    <div>
      <div className="px-2 pt-3">
        <BackButton />
      </div>
      <header className="px-4 pt-2 pb-4">
        <div className="text-[13px] text-subtle">{data?.name ?? " "}</div>
        <h1 className="text-[28px] font-bold tracking-tight">{tx("Все треки")}</h1>
        <p className="text-[13px] text-muted">{data ? tracksWord(all.length) : " "}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!tracks.length}
            onClick={() => play(0)}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-fg px-5 text-[15px] font-semibold text-bg disabled:opacity-30 md:flex-none"
          >
            <Play className="h-4 w-4 fill-current" />{tx(" Слушать")}
          </button>
          <button
            type="button"
            disabled={!tracks.length}
            onClick={() => play(0, true)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-card disabled:opacity-30"
            aria-label={tx("Перемешать")}
          >
            <Shuffle className="h-4 w-4" />
          </button>
          <DownloadAllButton tracks={tracks} />
        </div>
        <div className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 md:max-w-sm">
          <SearchIcon className="h-4 w-4 text-subtle" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={tx("Фильтр по названию")}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
          />
        </div>
      </header>

      {error && !data ? (
        <p className="px-4 pt-6 text-center text-sm text-subtle">{tx("Не удалось загрузить: ")}{error}</p>
      ) : !data ? (
        <TrackListSkeleton count={12} />
      ) : (
        <div className="border-t border-line pt-1">
          {tracks.map((t, i) => (
            <TrackRow key={t.id} track={t} index={i} onPlay={() => play(i)} />
          ))}
          {!tracks.length && <p className="px-4 pt-6 text-center text-sm text-subtle">{tx("Ничего не найдено")}</p>}
        </div>
      )}
    </div>
  );
}
