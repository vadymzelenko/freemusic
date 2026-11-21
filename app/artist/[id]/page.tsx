"use client";

import { tx } from "@/lib/i18n";
import { Check, ChevronRight, Play, Plus, Radio, Shuffle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlbumCard, ArtistCircle } from "@/components/Cards";
import { BackButton } from "@/components/BackButton";
import { TrackRow } from "@/components/TrackRow";
import { Cover } from "@/components/ui/Cover";
import { Shelf } from "@/components/ui/Shelf";
import { TrackListSkeleton } from "@/components/ui/Skeleton";
import { usePlayer } from "@/components/player/PlayerProvider";
import { cn } from "@/lib/cn";
import { artistKey, type ArtistPage } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { useLibrary } from "@/store/library";
import { useUI } from "@/store/ui";

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export default function ArtistScreen() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useApi<ArtistPage>(`/api/artist?id=${encodeURIComponent(id)}`);
  const { playTracks, setRadio } = usePlayer();
  const followed = useLibrary((s) => (data ? s.artists.some((a) => a.key === artistKey(data.name)) : false));
  const follow = useLibrary((s) => s.followArtist);
  const unfollow = useLibrary((s) => s.unfollowArtist);
  const toast = useUI((s) => s.showToast);

  if (error && !data) {
    return (
      <div className="px-2 pt-3">
        <BackButton />
        <p className="px-2 pt-8 text-center text-sm text-subtle">{tx("Не удалось загрузить артиста: ")}{error}</p>
      </div>
    );
  }

  const songs = data?.songs ?? [];

  return (
    <div>
      <div className="relative overflow-hidden">
        {data?.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.thumbnail}
            alt=""
            referrerPolicy="no-referrer"
            className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-3xl"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-bg" />
        <div className="relative px-2 pt-3">
          <BackButton />
        </div>
        <div className="relative flex flex-col items-center px-4 pt-3 pb-5 text-center md:grid md:grid-cols-[auto_1fr] md:items-end md:justify-items-start md:gap-x-8 md:px-0 md:pt-6 md:pb-8 md:text-left md:[&>*:first-child]:row-span-6 md:[&>*:not(:first-child)]:col-start-2">
          {data ? (
            <Cover src={data.thumbnail} alt="" className="h-40 w-40 shadow-2xl lg:h-56 lg:w-56" rounded="rounded-full" priority />
          ) : (
            <div className="skeleton h-40 w-40 rounded-full" />
          )}
          <h1 className="mt-4 text-[26px] md:mt-0 md:text-[34px] md:leading-tight font-bold tracking-tight">
            {data?.name ?? <span className="skeleton inline-block h-7 w-40 rounded" />}
          </h1>
          <div className="mt-4 flex w-full max-w-sm gap-2 md:max-w-md">
            <button
              type="button"
              disabled={!songs.length}
              onClick={() => {
                setRadio(true);
                playTracks(songs, 0);
              }}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-fg text-[15px] font-semibold text-bg disabled:opacity-30"
            >
              <Play className="h-4 w-4 fill-current" />{tx(" Слушать")}
            </button>
            <button
              type="button"
              disabled={!songs.length}
              onClick={() => {
                setRadio(true);
                playTracks(shuffled(songs), 0);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-card disabled:opacity-30"
              aria-label={tx("Перемешать")}
            >
              <Shuffle className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!songs.length}
              onClick={() => {
                setRadio(true);
                playTracks([songs[0]!], 0);
                toast(tx("Радио: {name}", { name: data?.name ?? "" }));
              }}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-card disabled:opacity-30"
              aria-label={tx("Радио артиста")}
            >
              <Radio className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!data}
              onClick={() => {
                if (!data) return;
                if (followed) unfollow(artistKey(data.name));
                else follow({ id: data.id, name: data.name, thumbnail: data.thumbnail });
                toast(followed ? tx("Убрано из ваших артистов") : tx("Добавлено в ваши артисты"));
              }}
              className={cn(
                "flex h-11 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium disabled:opacity-30",
                followed ? "border-fg/60 text-fg" : "border-line bg-card text-muted",
              )}
            >
              {followed ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {followed ? tx("Мой") : tx("В мои")}
            </button>
          </div>
        </div>
      </div>

      <section>
        <h2 className="px-4 pb-1 text-[19px] font-bold tracking-tight">{tx("Популярные треки")}</h2>
        {!data ? (
          <TrackListSkeleton count={5} />
        ) : (
          <>
            <div className="lg:grid lg:grid-cols-2 lg:gap-x-4">
              {songs.slice(0, 10).map((t, i) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  index={i}
                  onPlay={() => {
                    setRadio(true);
                    playTracks(songs, i);
                  }}
                />
              ))}
            </div>
            <div className="px-4 pt-2">
              <Link
                href={`/artist/${id}/songs`}
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-card text-[14px] font-medium active:bg-fg/10 md:max-w-xs"
              >
                {tx("Все треки ")}<ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </section>

      {data && data.albums.length > 0 && (
        <Shelf title={tx("Альбомы")}>
          {data.albums.map((a) => (
            <AlbumCard key={a.id} album={a} />
          ))}
        </Shelf>
      )}
      {data && data.singles.length > 0 && (
        <Shelf title={tx("Синглы и EP")}>
          {data.singles.map((a) => (
            <AlbumCard key={a.id} album={a} />
          ))}
        </Shelf>
      )}
      {data && data.related.length > 0 && (
        <Shelf title={tx("Похожие артисты")}>
          {data.related.map((a) => (
            <ArtistCircle key={a.id} artist={a} />
          ))}
        </Shelf>
      )}
      {data?.description && (
        <section className="mx-4 mt-8 rounded-xl border border-line bg-card p-4">
          <h2 className="mb-1 text-[15px] font-semibold">{tx("Об артисте")}</h2>
          <p className="line-clamp-6 whitespace-pre-line text-[13.5px] leading-relaxed text-muted">{data.description}</p>
        </section>
      )}
    </div>
  );
}
