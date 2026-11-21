"use client";

import { Check, ListMusic, Plus } from "lucide-react";
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useLibrary } from "@/store/library";
import { useUI } from "@/store/ui";

export function PlaylistPickerSheet() {
  const track = useUI((s) => s.playlistPickerTrack);
  const close = useUI((s) => s.closePlaylistPicker);
  const toast = useUI((s) => s.showToast);
  const playlists = useLibrary((s) => s.playlists);
  const addToPlaylist = useLibrary((s) => s.addToPlaylist);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const [name, setName] = useState("");

  const onClose = () => {
    setName("");
    close();
  };

  return (
    <Sheet
      open={!!track}
      onClose={onClose}
      title={<div className="text-[15px] font-semibold">Добавить в плейлист</div>}
    >
      {track && (
        <div className="border-t border-line">
          <form
            className="flex items-center gap-2 px-5 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              createPlaylist(name, track);
              toast(`Создан «${name.trim()}»`);
              onClose();
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Новый плейлист"
              className="h-10 flex-1 rounded-lg border border-line bg-bg px-3 text-[15px] outline-none placeholder:text-subtle focus:border-line-strong"
            />
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-fg px-3 text-sm font-medium text-bg transition-opacity disabled:opacity-30"
            >
              <Plus className="h-4 w-4" /> Создать
            </button>
          </form>
          {playlists.length === 0 ? (
            <p className="px-5 pb-4 text-sm text-subtle">Плейлистов пока нет.</p>
          ) : (
            playlists.map((p) => {
              const has = p.trackIds.includes(track.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={has}
                  onClick={() => {
                    addToPlaylist(p.id, track);
                    toast(`Добавлено в «${p.name}»`);
                    onClose();
                  }}
                  className="flex w-full items-center gap-4 px-5 py-3 text-left active:bg-white/[0.05] disabled:opacity-50 md:hover:bg-white/[0.03]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-bg text-muted">
                    <ListMusic className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{p.name}</span>
                    <span className="block text-xs text-subtle">{p.trackIds.length} треков</span>
                  </span>
                  {has && <Check className="h-4 w-4 text-muted" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </Sheet>
  );
}
