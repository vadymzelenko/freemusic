"use client";

import { create } from "zustand";

interface UIState {
  toast: { id: number; text: string } | null;
  /** full-screen "now on air" player */
  playerOpen: boolean;
  setPlayerOpen: (v: boolean) => void;
  showToast: (text: string) => void;
}

export const useUI = create<UIState>((set) => ({
  toast: null,
  playerOpen: false,
  setPlayerOpen: (v) => set({ playerOpen: v }),
  showToast: (text) => set({ toast: { id: Date.now(), text } }),
}));
