"use client";

import { tx } from "@/lib/i18n";
import { ChevronLeft, ThumbsUp, Pencil, Play, Shuffle, ThumbsDown, Trash2, X } from "lucide-react";
import { tracksWord } from "@/lib/plural";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { TrackRow } from "@/components/TrackRow";
import { DownloadAllButton } from "@/components/DownloadAllButton";
import { Cover } from "@/components/ui/Cover";
import { Sheet } from "@/components/ui/Sheet";
import { TrackListSkeleton } from "@/components/ui/Skeleton";
import { usePlayer } from "@/components/player/PlayerProvider";
import type { Track } from "@/lib/types";
import { useHydrated, useLibrary } from "@/store/library";

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export default function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const hydrated = useHydrated();
  const isDisliked = id === "disliked";
  const isLiked = id === "liked" || isDisliked;
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === id));
  const likedIds = useLibrary((s) => (isDisliked ? s.dislikedIds : s.likedIds));
  const toggleDislike = useLibrary((s) => s.toggleDislike);
  const all = useLibrary((s) => s.tracks);
  const removeFromPlaylist = useLibrary((s) => s.removeFromPlaylist);
  const renamePlaylist = useLibrary((s) => s.renamePlaylist);
  const deletePlaylist = useLibrary((s) => s.deletePlaylist);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const { playTracks, setRadio } = usePlayer();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  const tracks = useMemo<Track[]>(() => {
    const ids = isLiked ? likedIds : (playlist?.trackIds ?? []);
    return ids.map((x) => all[x]).filter((t): t is Track => !!t);
  }, [isLiked, likedIds, playlist, all]);

  const title = isDisliked ? tx("Не нравится") : isLiked ? tx("Любимые треки") : (playlist?.name ?? tx("Плейлист"));

  if (hydrated && !isLiked && !playlist) {
    return (
      <div className="px-4 pt-10 text-center">
        <p className="text-sm text-subtle">{tx("Плейлист не найден.")}</p>
        <Link href="/library" className="mt-3 inline-block text-sm underline underline-offset-4">
          {tx("В медиатеку")}
        </Link>
      </div>
    );
  }

  const playAll = (shuffle: boolean) => {
    if (!tracks.length) return;
    setRadio(false);
    playTracks(shuffle ? shuffled(tracks) : tracks, 0);
  };

  return (
    <div>
      <div className="flex items-center justify-between px-2 pt-3">
        <Link
          href="/library"
          className="flex h-10 items-center gap-0.5 rounded-full pr-3 text-[15px] text-muted active:bg-fg/10"
        >
          <ChevronLeft className="h-5 w-5" />{tx(" Медиатека")}
        </Link>
        {!isLiked && playlist && (
          <div className="flex">
            <button
              type="button"
              onClick={() => {
                setName(playlist.name);
                setEditing(true);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-fg/10"
              aria-label={tx("Переименовать")}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(tx("Удалить «{name}»?", { name: playlist.name }))) {
                  deletePlaylist(playlist.id);
                  router.replace("/library");
                }
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-fg/10"
              aria-label={tx("Удалить плейлист")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center px-4 pt-3 pb-5 text-center md:grid md:grid-cols-[auto_1fr] md:items-end md:justify-items-start md:gap-x-8 md:px-0 md:pt-6 md:pb-8 md:text-left md:[&>*:first-child]:row-span-6 md:[&>*:not(:first-child)]:col-start-2">
        {isLiked ? (
          <div className="flex h-40 w-40 lg:h-56 lg:w-56 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-200 to-zinc-500 shadow-2xl">
            {isDisliked ? <ThumbsDown className="h-14 w-14 fill-bg text-bg" /> : <ThumbsUp className="h-14 w-14 fill-bg text-bg" />}
          </div>
        ) : (
          <Cover src={tracks[0]?.cover} alt="" className="h-40 w-40 shadow-2xl lg:h-56 lg:w-56" rounded="rounded-2xl" />
        )}
        <h1 className="mt-4 text-[22px] md:mt-0 md:text-[34px] md:leading-tight font-bold tracking-tight">{title}</h1>
        <p className="mt-0.5 text-[13px] text-muted">{hydrated ? `${tracksWord(tracks.length)}` : " "}</p>
        <div className="mt-4 flex w-full max-w-xs gap-2 md:max-w-md">
          <button
            type="button"
            disabled={!tracks.length}
            onClick={() => playAll(false)}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-fg text-[15px] font-semibold text-bg active:opacity-90 disabled:opacity-30"
          >
            <Play className="h-4 w-4 fill-current" />{tx(" Слушать")}
          </button>
          <button
            type="button"
            disabled={!tracks.length}
            onClick={() => playAll(true)}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-card text-[15px] font-semibold active:bg-fg/10 disabled:opacity-30"
          >
            <Shuffle className="h-4 w-4" />{tx(" Перемешать")}
          </button>
          {!isDisliked && <DownloadAllButton tracks={tracks} />}
        </div>
      </div>

      {!hydrated ? (
        <TrackListSkeleton count={6} />
      ) : tracks.length === 0 ? (
        <p className="px-4 pt-4 text-center text-sm text-subtle">
          {isDisliked
            ? tx("Здесь будут треки с дизлайком — их не будет в рекомендациях.")
            : isLiked
              ? tx("Ставьте лайк трекам — они появятся здесь.")
              : tx("Плейлист пуст.")}
        </p>
      ) : (
        <div className="border-t border-line pt-1">
          {tracks.map((t, i) => (
            <TrackRow
              key={t.id}
              track={t}
              index={i}
              onPlay={() => {
                setRadio(false);
                playTracks(tracks, i);
              }}
              trailing={
                <button
                  type="button"
                  onClick={() =>
                    isDisliked ? toggleDislike(t) : isLiked ? toggleLike(t) : playlist && removeFromPlaylist(playlist.id, t.id)
                  }
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-subtle hover:text-fg active:bg-fg/10"
                  aria-label={tx("Удалить")}
                >
                  <X className="h-4 w-4" />
                </button>
              }
            />
          ))}
        </div>
      )}

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title={<div className="text-[15px] font-semibold">{tx("Переименовать")}</div>}
      >
        <form
          className="flex gap-2 px-5 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (playlist && name.trim()) renamePlaylist(playlist.id, name.trim());
            setEditing(false);
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 flex-1 rounded-lg border border-line bg-bg px-3 text-[16px] outline-none focus:border-line-strong"
          />
          <button type="submit" className="h-11 rounded-lg bg-fg px-4 text-sm font-medium text-bg">
            {tx("Готово")}
          </button>
        </form>
      </Sheet>
    </div>
  );
}
