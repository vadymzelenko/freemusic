"use client";

import { TabBar } from "@/components/TabBar";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { FullPlayer } from "@/components/player/FullPlayer";
import { TrackActionsSheet } from "@/components/TrackActionsSheet";
import { PlaylistPickerSheet } from "@/components/PlaylistPickerSheet";
import { Toast } from "@/components/Toast";
import { ServiceWorker } from "@/components/ServiceWorker";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Opaque strip under the translucent iOS status bar */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-[var(--safe-top)] bg-bg" />
      <main className="mx-auto min-h-dvh max-w-2xl pt-safe pb-app">{children}</main>
      <MiniPlayer />
      <TabBar />
      <FullPlayer />
      <TrackActionsSheet />
      <PlaylistPickerSheet />
      <Toast />
      <ServiceWorker />
    </>
  );
}
