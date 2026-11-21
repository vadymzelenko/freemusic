"use client";

import { useEffect } from "react";
import { TabBar } from "@/components/TabBar";
import { Sidebar } from "@/components/Sidebar";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { PlayerBar } from "@/components/player/PlayerBar";
import { FullPlayer } from "@/components/player/FullPlayer";
import { TrackActionsSheet } from "@/components/TrackActionsSheet";
import { PlaylistPickerSheet } from "@/components/PlaylistPickerSheet";
import { Toast } from "@/components/Toast";
import { ServiceWorker } from "@/components/ServiceWorker";
import { applyTheme } from "@/lib/themes";
import { useHydrated, useLibrary } from "@/store/library";

function ThemeSync() {
  const theme = useLibrary((s) => s.theme);
  const hydrated = useHydrated();
  // before hydration the store has the default theme — keep what the boot script applied
  useEffect(() => {
    if (hydrated) applyTheme(theme);
  }, [theme, hydrated]);
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ThemeSync />
      {/* Opaque strip under the translucent iOS status bar */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-[var(--safe-top)] bg-bg" />
      <Sidebar />
      <main className="ml-sidebar min-h-dvh pt-safe pb-app">
        <div className="mx-auto w-full max-w-2xl md:max-w-none md:px-4 lg:max-w-[1320px] lg:px-8">{children}</div>
      </main>
      <MiniPlayer />
      <PlayerBar />
      <TabBar />
      <FullPlayer />
      <TrackActionsSheet />
      <PlaylistPickerSheet />
      <Toast />
      <ServiceWorker />
    </>
  );
}
