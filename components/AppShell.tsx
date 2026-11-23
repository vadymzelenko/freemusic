"use client";

import { Fragment, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { resolveLang, setCurrentLang, type Lang } from "@/lib/i18n";
import { TabBar } from "@/components/TabBar";
import { Sidebar } from "@/components/Sidebar";
import { RadioBar } from "@/components/radio/RadioBar";
import { NowPlayingScreen } from "@/components/radio/NowPlayingScreen";
import { Toast } from "@/components/Toast";
import { ServiceWorker } from "@/components/ServiceWorker";
import { applyTheme } from "@/lib/themes";
import { useHydrated, useLibrary } from "@/store/library";

/** Applies the language; the UI subtree is re-mounted (keyed) when it changes. Audio is unaffected. */
function useLang(): Lang {
  const pref = useLibrary((s) => s.lang);
  const hydrated = useHydrated();
  const [lang, setLang] = useState<Lang>("ru"); // SSR renders Russian; switch after hydration
  useEffect(() => {
    if (!hydrated) return;
    const l = resolveLang(pref);
    setCurrentLang(l);
    document.documentElement.lang = l;
    setLang(l);
  }, [pref, hydrated]);
  return lang;
}

function ThemeSync() {
  const theme = useLibrary((s) => s.theme);
  const hydrated = useHydrated();
  // before hydration the store has the default theme — keep what the boot script applied
  useEffect(() => {
    if (hydrated) applyTheme(theme);
  }, [theme, hydrated]);
  return null;
}

/** First launch (or a fresh account) → the taste survey. */
function SurveyGate() {
  const hydrated = useHydrated();
  const surveyed = useLibrary((s) => s.radioPrefs.surveyed);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (hydrated && !surveyed && pathname !== "/onboarding") router.replace("/onboarding");
  }, [hydrated, surveyed, pathname, router]);
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const lang = useLang();
  return (
    <Fragment key={lang}>
      <ThemeSync />
      <SurveyGate />
      {/* Opaque strip under the translucent iOS status bar */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-[var(--safe-top)] bg-bg" />
      <Sidebar />
      <main className="ml-sidebar min-h-dvh pt-safe pb-app">
        <div className="mx-auto w-full max-w-2xl md:max-w-none md:px-4 lg:max-w-[1320px] lg:px-8">{children}</div>
      </main>
      <RadioBar />
      <TabBar />
      <NowPlayingScreen />
      <Toast />
      <ServiceWorker />
    </Fragment>
  );
}
