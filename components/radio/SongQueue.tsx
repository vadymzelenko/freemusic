"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Flame, Loader2, Radar, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n";
import { songTrack } from "@/lib/radio/match";
import { useNow } from "@/lib/use-now";
import { useLibrary } from "@/store/library";
import { freshOnly, useRadio, type QueueItem } from "./RadioProvider";
import { SongCover } from "./SongCover";

export const FRESHNESS: { s: number; label: string }[] = [
  { s: 10, label: "10 с" },
  { s: 30, label: "30 с" },
  { s: 60, label: "1 мин" },
  { s: 180, label: "3 мин" },
  { s: 0, label: "Все" },
];

/** "0:07" since the song started; "" when unknown */
function age(startedAt: number | null, now: number): string {
  if (startedAt === null) return "";
  const s = Math.max(0, Math.round((now - startedAt) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Bars() {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="eq-bar h-4 w-[3px] rounded-full bg-amber-300" style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </span>
  );
}

export function QueueRow({ it, now }: { it: QueueItem; now: number }) {
  const r = useRadio();
  const isCur = r.station?.id === it.station.id && r.current?.raw === it.np.raw;
  const busy = r.checking === it.station.id;
  const a = age(it.startedAt, now);
  const fresh = it.startedAt !== null && now - it.startedAt < 30_000;
  return (
    <button
      type="button"
      onClick={() => (isCur ? r.toggle() : void r.playItem(it))}
      className={cn("flex w-full items-center gap-3.5 rounded-xl px-4 py-2 text-left transition-colors md:px-3", isCur ? "bg-fg/[0.06]" : "active:bg-fg/[0.04] md:hover:bg-fg/[0.03]")}
    >
      <div className="relative">
        <SongCover track={songTrack(it.np)} className="h-14 w-14" rounded="rounded-lg" />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/55">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[16px] font-semibold leading-tight", isCur && "text-amber-300")}>{it.np.title}</div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[14px] text-muted">
          {it.tier >= 2 && <Flame className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
          {it.tier === 1 && <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" />}
          <span className="truncate">{it.np.artist}</span>
        </div>
      </div>
      <div className="w-12 shrink-0 text-right">
        {isCur && r.playing ? (
          <span className="inline-flex justify-end">
            <Bars />
          </span>
        ) : (
          a && <span className={cn("font-mono text-[12.5px] tabular-nums", fresh ? "text-emerald-400" : "text-subtle")}>{a}</span>
        )}
      </div>
    </button>
  );
}

export function FreshnessPicker({ className }: { className?: string }) {
  const f = useLibrary((s) => s.radioPrefs.freshness);
  const set = useLibrary((s) => s.setRadioPrefs);
  return (
    <div className={cn("no-scrollbar flex gap-1.5 overflow-x-auto", className)} role="radiogroup" aria-label={tx("Песни, начавшиеся не позже")}>
      {FRESHNESS.map((o) => (
        <button
          key={o.s}
          type="button"
          role="radio"
          aria-checked={f === o.s}
          onClick={() => set({ freshness: o.s })}
          className={cn(
            "h-8 shrink-0 rounded-full px-3 text-[13px] font-medium transition-colors",
            f === o.s ? "bg-fg text-bg" : "bg-fg/[0.06] text-muted hover:text-fg",
          )}
        >
          {o.s ? `≤ ${tx(o.label)}` : tx(o.label)}
        </button>
      ))}
    </div>
  );
}

/** One song per title (the same hit is often on several stations): keep the best / freshest. */
export function dedupe(items: QueueItem[]): QueueItem[] {
  const seen = new Set<string>();
  return items.filter((q) => {
    const k = songTrack(q.np).id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The song queue: what started on air recently, yours first. */
export function SongQueue({ limit = 30 }: { limit?: number }) {
  const r = useRadio();
  const f = useLibrary((s) => s.radioPrefs.freshness);
  const now = useNow(1000);
  const [more, setMore] = useState(false);
  // re-filter at most every 2 s so rows don't jitter
  const tick = Math.floor(now / 2000);
  const list = useMemo(() => dedupe(freshOnly(r.queue, f, tick * 2000)), [r.queue, f, tick]);
  const shown = more ? list : list.slice(0, limit);

  return (
    <div>
      <FreshnessPicker className="px-4 md:px-0" />
      <div className="mt-3">
        <AnimatePresence initial={false}>
          {shown.map((it) => (
            <motion.div
              key={it.key}
              layout="position"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
            >
              <QueueRow it={it} now={now} />
            </motion.div>
          ))}
        </AnimatePresence>
        {!list.length && (
          <div className="flex flex-col items-center px-8 py-10 text-center">
            {r.pool.length ? <Radar className="h-9 w-9 animate-pulse text-subtle" /> : <Loader2 className="h-7 w-7 animate-spin text-subtle" />}
            <p className="mt-3 text-[15px] font-medium">{f ? tx("Ждём, когда начнутся новые песни") : tx("Сканируем эфир")}</p>
            <p className="mt-1 text-[13px] text-subtle">{tx("Слушаем {n} станций в ваших жанрах", { n: r.pool.length })}</p>
          </div>
        )}
        {!more && list.length > limit && (
          <button type="button" onClick={() => setMore(true)} className="mx-4 mt-2 h-10 w-[calc(100%-2rem)] rounded-xl bg-fg/[0.05] text-[14px] font-medium text-muted md:mx-0 md:w-full">
            {tx("Ещё {n}", { n: list.length - limit })}
          </button>
        )}
      </div>
    </div>
  );
}
