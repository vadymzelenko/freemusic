"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Track } from "@/lib/types";

export interface DownloadedItem {
  track: Track;
  bytes: number;
  at: number;
}

export type DownloadStatus =
  | { state: "queued" }
  | { state: "downloading"; progress: number }
  | { state: "error"; message: string };

interface DownloadsState {
  /** Device-local: what is stored in Cache Storage. Never synced. */
  items: Record<string, DownloadedItem>;
  /** Transient progress (not persisted). */
  active: Record<string, DownloadStatus>;
  markDone: (t: Track, bytes: number) => void;
  setStatus: (id: string, s: DownloadStatus | null) => void;
  remove: (id: string) => void;
}

export const useDownloads = create<DownloadsState>()(
  persist(
    (set) => ({
      items: {},
      active: {},
      markDone: (t, bytes) =>
        set((s) => {
          const active = { ...s.active };
          delete active[t.id];
          return { items: { ...s.items, [t.id]: { track: t, bytes, at: Date.now() } }, active };
        }),
      setStatus: (id, st) =>
        set((s) => {
          const active = { ...s.active };
          if (st) active[id] = st;
          else delete active[id];
          return { active };
        }),
      remove: (id) =>
        set((s) => {
          const items = { ...s.items };
          delete items[id];
          return { items };
        }),
    }),
    {
      name: "freemusic-downloads",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

/** Synchronous check used by the player when choosing `audio.src`. */
export function isDownloaded(id: string): boolean {
  return !!useDownloads.getState().items[id];
}
