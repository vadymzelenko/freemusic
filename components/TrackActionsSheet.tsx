"use client";

import {
  Disc3,
  Download,
  Heart,
  ListEnd,
  ListPlus,
  ListStart,
  Radio,
  ThumbsDown,
  Trash2,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Cover } from "@/components/ui/Cover";
import { Sheet, SheetItem } from "@/components/ui/Sheet";
import { usePlayer } from "@/components/player/PlayerProvider";
import { downloadTracks, removeDownload } from "@/lib/downloads";
import { useDownloads } from "@/store/downloads";
import { useLibrary, useReaction } from "@/store/library";
import { useUI } from "@/store/ui";

export function TrackActionsSheet() {
  const track = useUI((s) => s.actionTrack);
  const close = useUI((s) => s.closeActions);
  const openPicker = useUI((s) => s.openPlaylistPicker);
  const toast = useUI((s) => s.showToast);
  const reaction = useReaction(track?.id);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const toggleDislike = useLibrary((s) => s.toggleDislike);
  const downloaded = useDownloads((s) => (track ? !!s.items[track.id] : false));
  const { playNext, addToQueue, playTrack, setRadio, current, next, setPlayerOpen } = usePlayer();
  const router = useRouter();

  const run = (fn: () => void, msg?: string) => () => {
    fn();
    close();
    if (msg) toast(msg);
  };
  const go = (href: string) => () => {
    close();
    setPlayerOpen(false);
    router.push(href);
  };

  return (
    <Sheet
      open={!!track}
      onClose={close}
      title={
        track && (
          <div className="flex items-center gap-3">
            <Cover src={track.cover} alt="" className="h-12 w-12" />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-medium">{track.title}</div>
              <div className="truncate text-[13px] text-muted">{track.artist}</div>
            </div>
          </div>
        )
      }
    >
      {track && (
        <div className="border-t border-line pt-1">
          <SheetItem icon={<ListStart />} onClick={run(() => playNext(track), "Сыграет следующим")}>
            Воспроизвести следующим
          </SheetItem>
          <SheetItem icon={<ListEnd />} onClick={run(() => addToQueue(track), "Добавлено в очередь")}>
            Добавить в очередь
          </SheetItem>
          <SheetItem
            icon={<Radio />}
            onClick={run(() => {
              setRadio(true);
              playTrack(track);
            }, "Радио по треку")}
          >
            Запустить радио
          </SheetItem>
          <SheetItem
            icon={<Heart className={reaction === 1 ? "fill-fg text-fg" : ""} />}
            onClick={run(() => toggleLike(track), reaction === 1 ? "Удалено из любимых" : "Добавлено в любимые")}
          >
            {reaction === 1 ? "Убрать из любимых" : "Нравится"}
          </SheetItem>
          <SheetItem
            icon={<ThumbsDown className={reaction === -1 ? "fill-fg text-fg" : ""} />}
            onClick={run(() => {
              toggleDislike(track);
              if (reaction !== -1 && current?.id === track.id) next();
            }, reaction === -1 ? "Дизлайк снят" : "Больше не будем это предлагать")}
          >
            {reaction === -1 ? "Убрать дизлайк" : "Не нравится"}
          </SheetItem>
          <SheetItem icon={<ListPlus />} onClick={() => openPicker(track)}>
            Добавить в плейлист
          </SheetItem>
          {downloaded ? (
            <SheetItem icon={<Trash2 />} onClick={run(() => void removeDownload(track.id), "Загрузка удалена")}>
              Удалить загрузку
            </SheetItem>
          ) : (
            <SheetItem icon={<Download />} onClick={run(() => downloadTracks([track]), "Скачиваем…")}>
              Скачать
            </SheetItem>
          )}
          {track.artistId && (
            <SheetItem icon={<UserRound />} onClick={go(`/artist/${track.artistId}`)}>
              Перейти к артисту
            </SheetItem>
          )}
          {track.albumId && (
            <SheetItem icon={<Disc3 />} onClick={go(`/album/${track.albumId}`)}>
              Перейти к альбому
            </SheetItem>
          )}
        </div>
      )}
    </Sheet>
  );
}
