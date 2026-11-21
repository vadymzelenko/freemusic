"use client";

import { create } from "zustand";
import type { Track } from "@/lib/types";

interface UIState {
  actionTrack: Track | null;
  playlistPickerTrack: Track | null;
  toast: { id: number; text: string } | null;
  lyricsOpen: boolean;
  setLyricsOpen: (v: boolean) => void;
  openActions: (t: Track) => void;
  closeActions: () => void;
  openPlaylistPicker: (t: Track) => void;
  closePlaylistPicker: () => void;
  showToast: (text: string) => void;
}

export const useUI = create<UIState>((set) => ({
  actionTrack: null,
  playlistPickerTrack: null,
  toast: null,
  lyricsOpen: false,
  setLyricsOpen: (v) => set({ lyricsOpen: v }),
  openActions: (t) => set({ actionTrack: t }),
  closeActions: () => set({ actionTrack: null }),
  openPlaylistPicker: (t) => set({ playlistPickerTrack: t, actionTrack: null }),
  closePlaylistPicker: () => set({ playlistPickerTrack: null }),
  showToast: (text) => set({ toast: { id: Date.now(), text } }),
}));
