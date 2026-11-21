"use client";

import { Download, Play, Shuffle, Trash2 } from "lucide-react";
import { tracksWord } from "@/lib/plural";
import Link from "next/link";
import { useMemo } from "react";
import { BackButton } from "@/components/BackButton";
import { TrackRow } from "@/components/TrackRow";
import { usePlayer } from "@/components/player/PlayerProvider";
import { removeDownload } from "@/lib/downloads";
import type { Track } from "@/lib/types";
import { useDownloads } from "@/store/downloads";

export default function DownloadsPage() {
  const items = useDownloads((s) => s.items);
  const active = useDownloads((s) => s.active);
  const { playTracks, setRadio } = usePlayer();

  const tracks = useMemo<Track[]>(
    () => Object.values(items).sort((a, b) => b.at - a.at).map((d) => d.track),
    [items],
  );
  const bytes = Object.values(items).reduce((s, d) => s + d.bytes, 0);
  const pending = Object.entries(active).filter(([, st]) => st.state !== "error").length;
  const failed = Object.entries(active).filter(([, st]) => st.state === "error");

  const play = (i: number, shuffle = false) => {
    setRadio(false);
    playTracks(shuffle ? [...tracks].sort(() => Math.random() - 0.5) : tracks, i);
  };

  return (
    <div>
      <div className="px-2 pt-3">
        <BackButton label="Медиатека" />
      </div>
      <div className="flex flex-col items-center px-4 pt-3 pb-5 text-center md:grid md:grid-cols-[auto_1fr] md:items-end md:justify-items-start md:gap-x-8 md:px-0 md:pt-6 md:pb-8 md:text-left md:[&>*:first-child]:row-span-6 md:[&>*:not(:first-child)]:col-start-2">
        <div className="flex h-40 w-40 lg:h-56 lg:w-56 items-center justify-center rounded-2xl border border-line bg-gradient-to-br from-zinc-700 to-zinc-900 shadow-2xl">
          <Download className="h-14 w-14 text-white" />
        </div>
        <h1 className="mt-4 text-[22px] md:mt-0 md:text-[34px] md:leading-tight font-bold tracking-tight">Скачанное</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          {tracksWord(tracks.length)} · {Math.round(bytes / 1e6)} МБ · доступно без интернета
        </p>
        {pending > 0 && <p className="mt-1 text-[12.5px] text-subtle">Скачивается: {pending}</p>}
        <div className="mt-4 flex w-full max-w-xs gap-2 md:max-w-md">
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
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-card text-[15px] font-semibold disabled:opacity-30"
          >
            <Shuffle className="h-4 w-4" /> Перемешать
          </button>
        </div>
      </div>

      {failed.length > 0 && (
        <div className="mx-4 mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
          Не удалось скачать {failed.length}: {(failed[0]![1] as { message: string }).message}
        </div>
      )}

      {tracks.length === 0 ? (
        <p className="px-6 pt-4 text-center text-sm text-subtle">
          Скачивайте треки через меню «…», а альбомы и плейлисты — кнопкой загрузки на их странице.{" "}
          <Link href="/search" className="underline underline-offset-4">
            Найти музыку
          </Link>
        </p>
      ) : (
        <div className="border-t border-line pt-1">
          {tracks.map((t, i) => (
            <TrackRow
              key={t.id}
              track={t}
              onPlay={() => play(i)}
              trailing={
                <button
                  type="button"
                  onClick={() => void removeDownload(t.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-subtle hover:text-fg active:bg-fg/10"
                  aria-label="Удалить загрузку"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
