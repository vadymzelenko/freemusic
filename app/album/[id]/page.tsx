"use client";

import { Play, Shuffle } from "lucide-react";
import { tracksWord } from "@/lib/plural";
import { DownloadAllButton } from "@/components/DownloadAllButton";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { TrackRow } from "@/components/TrackRow";
import { Cover } from "@/components/ui/Cover";
import { TrackListSkeleton } from "@/components/ui/Skeleton";
import { usePlayer } from "@/components/player/PlayerProvider";
import { formatTime } from "@/lib/format";
import type { AlbumPage } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function AlbumScreen() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useApi<AlbumPage>(`/api/album?id=${encodeURIComponent(id)}`);
  const { playTracks, setRadio } = usePlayer();
  const tracks = data?.tracks ?? [];
  const total = tracks.reduce((s, t) => s + t.duration, 0);

  const play = (start: number, shuffle = false) => {
    if (!tracks.length) return;
    setRadio(false);
    const list = shuffle ? [...tracks].sort(() => Math.random() - 0.5) : tracks;
    playTracks(list, start);
  };

  return (
    <div>
      <div className="px-2 pt-3">
        <BackButton />
      </div>
      {error && !data ? (
        <p className="px-4 pt-8 text-center text-sm text-subtle">Не удалось загрузить альбом: {error}</p>
      ) : (
        <>
          <div className="flex flex-col items-center px-4 pt-3 pb-5 text-center">
            {data ? (
              <Cover src={data.cover} alt="" className="h-52 w-52 shadow-2xl" rounded="rounded-2xl" priority />
            ) : (
              <div className="skeleton h-52 w-52 rounded-2xl" />
            )}
            <h1 className="mt-4 text-[22px] font-bold leading-tight tracking-tight">
              {data?.title ?? <span className="skeleton inline-block h-6 w-48 rounded" />}
            </h1>
            {data &&
              (data.artistId ? (
                <Link href={`/artist/${data.artistId}`} className="mt-1 text-[15px] text-muted hover:text-fg">
                  {data.artist}
                </Link>
              ) : (
                <p className="mt-1 text-[15px] text-muted">{data.artist}</p>
              ))}
            {data && (
              <p className="mt-0.5 text-[12.5px] text-subtle">
                {[data.kind === "single" ? "Сингл" : data.kind === "ep" ? "EP" : "Альбом", data.year, `${tracksWord(tracks.length)}`, total ? formatTime(total) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <div className="mt-4 flex w-full max-w-sm gap-2">
              <button
                type="button"
                disabled={!tracks.length}
                onClick={() => play(0)}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-fg text-[15px] font-semibold text-bg disabled:opacity-30"
              >
                <Play className="h-4 w-4 fill-current" /> Слушать
              </button>
              <button
                type="button"
                disabled={!tracks.length}
                onClick={() => play(0, true)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-card disabled:opacity-30"
                aria-label="Перемешать"
              >
                <Shuffle className="h-4 w-4" />
              </button>
              <DownloadAllButton tracks={tracks} />
            </div>
          </div>
          {!data ? (
            <TrackListSkeleton count={8} />
          ) : (
            <div className="border-t border-line pt-1">
              {tracks.map((t, i) => (
                <TrackRow key={t.id} track={t} index={i} onPlay={() => play(i)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
