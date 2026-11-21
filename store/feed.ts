"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { MixPool } from "@/lib/types";

/*
 * The home feed is built once and then kept (also across app launches) so that liking a
 * track doesn't rebuild / reorder everything. It's rebuilt on a new day, after 6 hours,
 * or when the user taps "refresh".
 */

export interface SeedArtist {
  id: string;
  name: string;
  thumbnail?: string;
}

interface FeedState {
  builtAt: number;
  day: string;
  salt: string;
  pools: MixPool[];
  /** remaining seeds for "load more", in priority order */
  pendingArtists: SeedArtist[];
  pendingTracks: string[];
  loading: number;
  reset: (day: string, salt: string, artists: SeedArtist[], tracks: string[]) => void;
  addPool: (p: MixPool) => void;
  takeSeeds: (nArtists: number, nTracks: number) => { artists: SeedArtist[]; tracks: string[] };
  setLoading: (delta: number) => void;
}

export const useFeed = create<FeedState>()(
  persist(
    (set, get) => ({
      builtAt: 0,
      day: "",
      salt: "",
      pools: [],
      pendingArtists: [],
      pendingTracks: [],
      loading: 0,
      reset: (day, salt, artists, tracks) =>
        set({ builtAt: Date.now(), day, salt, pools: [], pendingArtists: artists, pendingTracks: tracks, loading: 0 }),
      addPool: (p) =>
        set((s) =>
          s.pools.some((x) => x.kind === p.kind && x.seedId === p.seedId) ? s : { pools: [...s.pools, p] },
        ),
      takeSeeds: (nArtists, nTracks) => {
        const s = get();
        const artists = s.pendingArtists.slice(0, nArtists);
        const tracks = s.pendingTracks.slice(0, nTracks);
        set({ pendingArtists: s.pendingArtists.slice(nArtists), pendingTracks: s.pendingTracks.slice(nTracks) });
        return { artists, tracks };
      },
      setLoading: (delta) => set((s) => ({ loading: Math.max(0, s.loading + delta) })),
    }),
    {
      name: "freemusic-feed",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        builtAt: s.builtAt,
        day: s.day,
        salt: s.salt,
        pools: s.pools,
        pendingArtists: s.pendingArtists,
        pendingTracks: s.pendingTracks,
      }),
    },
  ),
);
