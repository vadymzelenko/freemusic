"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { artistKey, type FollowedArtist, type PlayEvent, type Playlist, type Track } from "@/lib/types";

export const MAX_PLAYS = 5000;

export interface LibraryData {
  /** Track metadata cache — everything else references tracks by id. */
  tracks: Record<string, Track>;
  likedIds: string[];
  dislikedIds: string[];
  playlists: Playlist[];
  artists: FollowedArtist[];
  plays: PlayEvent[];
  searchHistory: string[];
  onboarded: boolean;
  /** Home sections the user switched off (see HOME_SECTIONS). Synced. */
  hiddenSections: string[];
  /** Visual theme id (see lib/themes.ts). Synced. */
  theme: string;
  /** UI language; "" = follow the device. Synced. */
  lang: string;
  /** Last queue snapshot for session restore. */
  lastQueue: { tracks: Track[]; index: number; radio: boolean };
}

interface LibraryState extends LibraryData {
  remember: (t: Track | Track[]) => void;
  toggleLike: (t: Track) => void;
  toggleDislike: (t: Track) => void;
  createPlaylist: (name: string, first?: Track) => string;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (playlistId: string, t: Track | Track[]) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  followArtist: (a: Omit<FollowedArtist, "key" | "addedAt"> & { key?: string }) => void;
  unfollowArtist: (key: string) => void;
  setOnboarded: (v: boolean) => void;
  toggleSection: (id: string) => void;
  setTheme: (id: string) => void;
  setLang: (lang: string) => void;
  recordPlay: (t: Track, listened: number, completed: boolean) => void;
  clearHistory: () => void;
  pushSearch: (q: string) => void;
  clearSearchHistory: () => void;
  saveQueue: (tracks: Track[], index: number, radio: boolean) => void;
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const EMPTY_LIBRARY: LibraryData = {
  tracks: {},
  likedIds: [],
  dislikedIds: [],
  playlists: [],
  artists: [],
  plays: [],
  searchHistory: [],
  onboarded: false,
  hiddenSections: [],
  theme: "graphite",
  lang: "",
  lastQueue: { tracks: [], index: 0, radio: true },
};

export const HOME_SECTIONS: { id: string; title: string; hint: string }[] = [
  { id: "mixes", title: "Ваши миксы", hint: "Мой микс, Открытия, миксы артистов" },
  { id: "quick", title: "Быстрый выбор", hint: "Список треков, подобранных для вас" },
  { id: "because", title: "Потому что вам понравилось", hint: "Ряды похожих на любимые треки" },
  { id: "artists", title: "Ваши артисты", hint: "Кружки выбранных артистов" },
  { id: "recent", title: "Недавно слушали", hint: "" },
  { id: "liked", title: "Любимые треки", hint: "" },
];

/** Drop cached metadata nothing references any more (keeps localStorage small). */
function pruneTracks(s: LibraryData): Record<string, Track> {
  const keep = new Set<string>([
    ...s.likedIds,
    ...s.dislikedIds,
    ...s.playlists.flatMap((p) => p.trackIds),
    ...s.plays.slice(-300).map((p) => p.t),
  ]);
  const out: Record<string, Track> = {};
  for (const id of keep) {
    const t = s.tracks[id];
    if (t) out[id] = t;
  }
  return out;
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      ...EMPTY_LIBRARY,

      remember: (t) =>
        set((s) => {
          const list = Array.isArray(t) ? t : [t];
          const tracks = { ...s.tracks };
          for (const x of list) tracks[x.id] = { ...tracks[x.id], ...x };
          return { tracks };
        }),

      toggleLike: (t) =>
        set((s) => {
          const liked = s.likedIds.includes(t.id);
          return {
            tracks: { ...s.tracks, [t.id]: t },
            likedIds: liked ? s.likedIds.filter((id) => id !== t.id) : [t.id, ...s.likedIds],
            dislikedIds: s.dislikedIds.filter((id) => id !== t.id),
          };
        }),

      toggleDislike: (t) =>
        set((s) => {
          const disliked = s.dislikedIds.includes(t.id);
          return {
            tracks: { ...s.tracks, [t.id]: t },
            dislikedIds: disliked ? s.dislikedIds.filter((id) => id !== t.id) : [t.id, ...s.dislikedIds],
            likedIds: s.likedIds.filter((id) => id !== t.id),
          };
        }),

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
        set((s) => {
          const list = Array.isArray(t) ? t : [t];
          const tracks = { ...s.tracks };
          for (const x of list) tracks[x.id] = x;
          return {
            tracks,
            playlists: s.playlists.map((p) =>
              p.id === playlistId
                ? { ...p, trackIds: [...p.trackIds, ...list.map((x) => x.id).filter((id) => !p.trackIds.includes(id))] }
                : p,
            ),
          };
        }),

      removeFromPlaylist: (playlistId, trackId) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((x) => x !== trackId) } : p,
          ),
        })),

      followArtist: (a) =>
        set((s) => {
          const key = a.key ?? artistKey(a.name);
          if (s.artists.some((x) => x.key === key)) {
            return { artists: s.artists.map((x) => (x.key === key ? { ...x, ...a, key } : x)) };
          }
          return { artists: [{ ...a, key, addedAt: Date.now() }, ...s.artists] };
        }),

      unfollowArtist: (key) => set((s) => ({ artists: s.artists.filter((x) => x.key !== key) })),

      setOnboarded: (v) => set({ onboarded: v }),

      setTheme: (id) => set({ theme: id }),
      setLang: (lang) => set({ lang }),

      toggleSection: (id) =>
        set((s) => ({
          hiddenSections: s.hiddenSections.includes(id) ? s.hiddenSections.filter((x) => x !== id) : [...s.hiddenSections, id],
        })),

      recordPlay: (t, listened, completed) =>
        set((s) => {
          if (listened < 3 && !completed) return s; // accidental taps
          const skipped = !completed && listened < 30 && (t.duration === 0 || t.duration > 45);
          const ev: PlayEvent = { t: t.id, a: artistKey(t.artist), at: Date.now(), s: Math.round(listened), c: completed, k: skipped };
          return {
            tracks: { ...s.tracks, [t.id]: t },
            plays: [...s.plays, ev].slice(-MAX_PLAYS),
          };
        }),

      clearHistory: () => set({ plays: [] }),

      pushSearch: (q) =>
        set((s) => {
          const v = q.trim();
          if (!v) return s;
          return { searchHistory: [v, ...s.searchHistory.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 15) };
        }),

      clearSearchHistory: () => set({ searchHistory: [] }),

      saveQueue: (tracks, index, radio) => {
        // keep a window around the current track — enough to resume, small enough to sync
        const start = Math.max(0, index - 10);
        set({ lastQueue: { tracks: tracks.slice(start, start + 60), index: index - start, radio } });
      },
    }),
    {
      name: "freemusic-library",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        tracks: pruneTracks(s),
        likedIds: s.likedIds,
        dislikedIds: s.dislikedIds,
        playlists: s.playlists,
        artists: s.artists,
        plays: s.plays,
        searchHistory: s.searchHistory,
        onboarded: s.onboarded,
        hiddenSections: s.hiddenSections,
        theme: s.theme,
        lang: s.lang,
        lastQueue: s.lastQueue,
      }),
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as Partial<LibraryData>;
        if (version < 2) {
          return {
            ...EMPTY_LIBRARY,
            ...old,
            dislikedIds: [],
            artists: [],
            plays: [],
            // existing users with likes don't need the onboarding wall
            onboarded: (old.likedIds?.length ?? 0) > 0,
          } as LibraryData;
        }
        return { ...EMPTY_LIBRARY, ...old } as LibraryData;
      },
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

export function useReaction(id: string | undefined): 1 | -1 | 0 {
  return useLibrary((s) => (!id ? 0 : s.likedIds.includes(id) ? 1 : s.dislikedIds.includes(id) ? -1 : 0));
}
