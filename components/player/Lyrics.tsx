"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/cn";
import type { Track } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { usePlayer, useProgress } from "./PlayerProvider";

interface LyricsResult {
  synced?: string;
  plain?: string;
  instrumental?: boolean;
  source?: string;
}

interface Line {
  time: number;
  text: string;
}

/** Parses LRC: "[01:23.45] text" (a line may carry several timestamps). */
function parseLrc(lrc: string): Line[] {
  const out: Line[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2}(?:[.:]\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of stamps) {
      const time = parseInt(m[1]!, 10) * 60 + parseFloat(m[2]!.replace(":", "."));
      out.push({ time, text });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

export function lyricsPath(t: Track): string {
  const p = new URLSearchParams({
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: String(Math.round(t.duration || 0)),
  });
  if (t.album) p.set("album", t.album);
  return `/api/lyrics?${p}`;
}

function SyncedLyrics({ lines }: { lines: Line[] }) {
  const { seek } = usePlayer();
  const { time } = useProgress();
  const boxRef = useRef<HTMLDivElement>(null);
  const userScrollUntil = useRef(0);

  // small lead so the highlight lands with the voice, not after it
  const t = time + 0.3;
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.time <= t) active = i;
    else break;
  }

  useEffect(() => {
    const box = boxRef.current;
    if (!box || active < 0 || Date.now() < userScrollUntil.current) return;
    const el = box.querySelector<HTMLElement>(`[data-line="${active}"]`);
    if (!el) return;
    box.scrollTo({ top: el.offsetTop - box.clientHeight * 0.38, behavior: "smooth" });
  }, [active]);

  return (
    <div
      ref={boxRef}
      onWheel={() => (userScrollUntil.current = Date.now() + 3000)}
      onTouchMove={() => (userScrollUntil.current = Date.now() + 3000)}
      className="no-scrollbar relative h-full overflow-y-auto overscroll-contain px-1 py-[30%] [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_85%,transparent)]"
    >
      {lines.map((l, i) => (
        <button
          key={i}
          type="button"
          data-line={i}
          onClick={() => {
            userScrollUntil.current = 0;
            seek(l.time);
          }}
          className={cn(
            "block w-full origin-left py-1.5 text-left text-[24px] font-bold leading-snug tracking-tight transition-all duration-300",
            i === active ? "scale-100 text-fg" : i < active ? "scale-[0.97] text-fg/30" : "scale-[0.97] text-fg/45",
          )}
        >
          {l.text || "♪"}
        </button>
      ))}
    </div>
  );
}

export function Lyrics({ track }: { track: Track }) {
  const { data, error, loading } = useApi<LyricsResult>(lyricsPath(track));
  const lines = useMemo(() => (data?.synced ? parseLrc(data.synced) : []), [data]);

  if (loading && !data) {
    return (
      <div className="flex h-full flex-col justify-center gap-4 px-1">
        {[70, 85, 55, 90, 65].map((w, i) => (
          <div key={i} className="skeleton h-6 rounded" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }
  if (lines.length) return <SyncedLyrics lines={lines} />;
  if (data?.plain) {
    return (
      <div className="no-scrollbar h-full overflow-y-auto overscroll-contain px-1 py-6">
        <p className="mb-4 text-[12px] uppercase tracking-[0.1em] text-subtle">Текст без синхронизации</p>
        <p className="whitespace-pre-line text-[19px] font-semibold leading-relaxed text-fg/85">{data.plain}</p>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center text-center text-[15px] text-subtle">
      {data?.instrumental ? "Инструментальная композиция" : error ? "Не удалось загрузить текст" : "Текст не найден"}
    </div>
  );
}
