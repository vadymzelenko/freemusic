"use client";

import { registerPlugin } from "@capacitor/core";
import { nativePlatform } from "./platform";

interface VzMediaPlugin {
  start(o: { title: string; artist: string }): Promise<void>;
  stop(): Promise<void>;
}

const VzMedia = registerPlugin<VzMediaPlugin>("VzMedia");

let running = false;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Android: a foreground service keeps playback alive with the screen off. iOS needs nothing here.
 * Android 12+ forbids STARTING such a service from the background, so it is (re)started only while
 * the app is visible, kept running across track changes, and stopped after 5 minutes of pause.
 */
export function nativePlaying(track: { title: string; artist: string } | null) {
  if (nativePlatform() !== "android") return;
  if (track) {
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = null;
    if (!running || document.visibilityState === "visible") {
      if (document.visibilityState !== "visible" && !running) return;
      running = true;
      void VzMedia.start({ title: track.title, artist: track.artist }).catch(() => {
        running = false;
      });
    }
  } else if (running && !stopTimer) {
    stopTimer = setTimeout(() => {
      running = false;
      stopTimer = null;
      void VzMedia.stop().catch(() => {});
    }, 5 * 60 * 1000);
  }
}
