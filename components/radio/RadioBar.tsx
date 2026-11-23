"use client";

import { Loader2, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";
import { tx } from "@/lib/i18n";
import { useUI } from "@/store/ui";
import { useRadio } from "./RadioProvider";
import { StationLogo } from "./StationLogo";

/** Bottom bar while the radio is the active source (phone: above the tab bar; tablet/desktop: full width). */
export function RadioBar() {
  const r = useRadio();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useUI((s) => s.showToast);

  // announce smart switches
  useEffect(() => {
    if (!r.lastSwitch) return;
    const np = r.lastSwitch.np;
    toast(
      `${r.lastSwitch.to.name}: ${np ? `${np.artist ? `${np.artist} — ` : ""}${np.title}` : ""} · ${
        r.lastSwitch.kind === "track" ? tx("ваш трек") : r.lastSwitch.kind === "artist" ? tx("ваш артист") : tx("лучше подходит")
      }`,
    );
  }, [r.lastSwitch, toast]);

  if (!r.active || !r.station || pathname === "/onboarding") return null;
  const np = r.nowPlaying[r.station.id];
  const line = np ? `${np.artist ? `${np.artist} — ` : ""}${np.title}` : tx("Прямой эфир");

  return (
    <div
      className="fixed right-0 z-40 px-2 md:!bottom-0 md:border-t md:border-line md:bg-card/95 md:px-0 md:pb-safe md:backdrop-blur-xl"
      style={{ left: "var(--sidebar-w)", bottom: "calc(var(--tabbar-h) + var(--safe-bottom) + 6px)" }}
    >
      <div className="relative mx-auto flex h-[var(--mini-h)] max-w-2xl items-center gap-3 rounded-xl border border-line bg-card/90 pl-2 pr-1 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl md:max-w-none md:rounded-none md:border-0 md:bg-transparent md:px-5 md:shadow-none">
        <button type="button" onClick={() => router.push("/radio")} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <StationLogo station={r.station} className="h-11 w-11 md:h-14 md:w-14" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate text-[14px] font-medium leading-tight">
              <span className="truncate">{r.station.name}</span>
              {r.behindLive > 5 ? (
                <span className="shrink-0 rounded bg-fg/10 px-1 text-[10px] font-semibold tabular-nums text-muted">
                  −{formatTime(r.behindLive)}
                </span>
              ) : (
                <span className="shrink-0 rounded bg-red-500/90 px-1 text-[10px] font-bold tracking-wide text-white">LIVE</span>
              )}
            </div>
            <div className={cn("truncate text-[12.5px]", r.error ? "text-red-400" : "text-muted")}>{r.error ?? line}</div>
          </div>
        </button>
        {r.rewindWindow > 0 && (
          <button
            type="button"
            onClick={() => r.seekBack(30)}
            className="flex h-11 w-10 items-center justify-center rounded-full text-fg active:bg-fg/10"
            aria-label={tx("Назад на 30 секунд")}
          >
            <RotateCcw className="h-[18px] w-[18px]" />
          </button>
        )}
        <button
          type="button"
          onClick={r.toggle}
          className="flex h-11 w-11 items-center justify-center rounded-full text-fg active:scale-95 active:bg-fg/10 md:bg-fg md:text-bg"
          aria-label={r.playing ? tx("Пауза") : tx("Играть")}
        >
          {r.buffering && r.playing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : r.playing ? (
            <Pause className="h-[22px] w-[22px] fill-current" />
          ) : (
            <Play className="ml-0.5 h-[22px] w-[22px] fill-current" />
          )}
        </button>
        <button
          type="button"
          onClick={() => r.step(1)}
          className="flex h-11 w-10 items-center justify-center rounded-full text-fg active:scale-95 active:bg-fg/10"
          aria-label={tx("Следующая станция")}
        >
          <SkipForward className="h-5 w-5 fill-current" />
        </button>
      </div>
    </div>
  );
}
