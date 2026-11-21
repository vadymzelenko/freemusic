"use client";

import { Heart, ListEnd, ListPlus, ListStart, Radio } from "lucide-react";
import { Cover } from "@/components/ui/Cover";
import { Sheet, SheetItem } from "@/components/ui/Sheet";
import { usePlayer } from "@/components/player/PlayerProvider";
import { useLibrary } from "@/store/library";
import { useUI } from "@/store/ui";

export function TrackActionsSheet() {
  const track = useUI((s) => s.actionTrack);
  const close = useUI((s) => s.closeActions);
  const openPicker = useUI((s) => s.openPlaylistPicker);
  const toast = useUI((s) => s.showToast);
  const liked = useLibrary((s) => (track ? s.likedIds.includes(track.id) : false));
  const toggleLike = useLibrary((s) => s.toggleLike);
  const { playNext, addToQueue, playTrack, setRadio } = usePlayer();

  const run = (fn: () => void, msg?: string) => () => {
    fn();
    close();
    if (msg) toast(msg);
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
            icon={<Heart className={liked ? "fill-fg text-fg" : ""} />}
            onClick={run(() => toggleLike(track), liked ? "Удалено из любимых" : "Добавлено в любимые")}
          >
            {liked ? "Убрать из любимых" : "Нравится"}
          </SheetItem>
          <SheetItem icon={<ListPlus />} onClick={() => openPicker(track)}>
            Добавить в плейлист
          </SheetItem>
        </div>
      )}
    </Sheet>
  );
}
