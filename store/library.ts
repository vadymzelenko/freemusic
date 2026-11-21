"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Playlist, Track } from "@/lib/types";

interface LibraryState {
  /** Every track the user ever interacted with — playlists/likes reference these by id. */
  tracks: Record<string, Track>;
  likedIds: string[];
  playlists: Playlist[];
  searchHistory: string[];
  /** Last queue snapshot for session restore. */
  lastQueue: { tracks: Track[]; index: number; radio: boolean };

  remember: (t: Track | Track[]) => void;
  toggleLike: (t: Track) => void;
  isLiked: (id: string) => boolean;
  createPlaylist: (name: string, first?: Track) => string;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (playlistId: string, t: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  pushSearch: (q: string) => void;
  clearSearchHistory: () => void;
  saveQueue: (tracks: Track[], index: number, radio: boolean) => void;
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      tracks: {},
      likedIds: [],
      playlists: [],
      searchHistory: [],
      lastQueue: { tracks: [], index: 0, radio: true },

      remember: (t) =>
        set((s) => {
          const list = Array.isArray(t) ? t : [t];
          const tracks = { ...s.tracks };
          for (const x of list) tracks[x.id] = x;
          return { tracks };
        }),

      toggleLike: (t) =>
        set((s) => {
          const liked = s.likedIds.includes(t.id);
          return {
            tracks: { ...s.tracks, [t.id]: t },
            likedIds: liked ? s.likedIds.filter((id) => id !== t.id) : [t.id, ...s.likedIds],
          };
        }),

      isLiked: (id) => get().likedIds.includes(id),

      createPlaylist: (name, first) => {
        const id = uid();
        set((s) => ({
          tracks: first ? { ...s.tracks, [first.id]: first } : s.tracks,
          playlists: [
            { id, name: name.trim() || "Новый плейлист", trackIds: first ? [first.id] : [], createdAt: Date.now() },
            ...s.playlists,
          ],
        }));
        return id;
      },

      renamePlaylist: (id, name) =>
        set((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? { ...p, name } : p)) })),

      deletePlaylist: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),

      addToPlaylist: (playlistId, t) =>
        set((s) => ({
          tracks: { ...s.tracks, [t.id]: t },
          playlists: s.playlists.map((p) =>
            p.id === playlistId && !p.trackIds.includes(t.id) ? { ...p, trackIds: [...p.trackIds, t.id] } : p,
          ),
        })),

      removeFromPlaylist: (playlistId, trackId) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((x) => x !== trackId) } : p,
          ),
        })),

      pushSearch: (q) =>
        set((s) => {
          const v = q.trim();
          if (!v) return s;
          return { searchHistory: [v, ...s.searchHistory.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 15) };
        }),

      clearSearchHistory: () => set({ searchHistory: [] }),

      saveQueue: (tracks, index, radio) => set({ lastQueue: { tracks: tracks.slice(0, 200), index, radio } }),
    }),
    {
      name: "freemusic-library",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);

/** Hydrates from localStorage once and keeps tabs/windows in sync via the `storage` event. */
export function initLibrarySync(): () => void {
  void useLibrary.persist.rehydrate();
  const onStorage = (e: StorageEvent) => {
    if (e.key === "freemusic-library") void useLibrary.persist.rehydrate();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/** True once persisted data has been loaded on the client. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useLibrary.persist.onFinishHydration(cb),
    () => useLibrary.persist.hasHydrated(),
    () => false,
  );
}
