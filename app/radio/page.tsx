"use client";

import { Loader2, RadioTower, RefreshCw, Search as SearchIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRadio } from "@/components/radio/RadioProvider";
import { npLine, StationRow } from "@/components/radio/StationRow";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n";
import { pseudoFrequency, RADIO_ERAS, RADIO_GENRES, type Station } from "@/lib/radio/types";
import { useApi } from "@/lib/use-api";
import { useDebounced } from "@/lib/use-debounce";
import { useLibrary } from "@/store/library";

/* ---------------- Retro tuner: LCD + draggable dial ---------------- */

function Tuner() {
  const r = useRadio();
  const dial = useMemo(
    () => [...r.pool].sort((a, b) => parseFloat(pseudoFrequency(a.id)) - parseFloat(pseudoFrequency(b.id))),
    [r.pool],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const userScroll = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focus, setFocus] = useState<Station | null>(null);
  const ITEM = 92;

  const shown = focus ?? r.station ?? dial[0] ?? null;
  const np = shown ? r.nowPlaying[shown.id] : null;

  // keep the needle on the playing station
  useEffect(() => {
    const el = scroller.current;
    if (!el || !r.station || userScroll.current) return;
    const i = dial.findIndex((s) => s.id === r.station!.id);
    if (i >= 0) el.scrollTo({ left: i * ITEM, behavior: "smooth" });
  }, [r.station, dial]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / ITEM);
    const s = dial[Math.max(0, Math.min(dial.length - 1, i))];
    if (s && s.id !== focus?.id) setFocus(s);
    if (!userScroll.current) return;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      userScroll.current = false;
      if (s && s.id !== r.station?.id) r.tune(s);
      setFocus(null);
    }, 450);
  };
  const markUser = () => {
    userScroll.current = true;
  };

  return (
    <section className="mx-4 overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-card to-bg md:mx-0">
      {/* LCD */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[44px] font-bold leading-none tracking-tight tabular-nums text-amber-300 [text-shadow:0_0_18px_rgba(252,211,77,0.35)]">
            {shown ? pseudoFrequency(shown.id) : "--.-"}
          </span>
          <span className="font-mono text-[13px] font-semibold text-amber-300/70">FM</span>
          {r.station && shown?.id === r.station.id && r.playing && (
            <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold tracking-widest text-red-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> ON AIR
            </span>
          )}
        </div>
        <div className="mt-2 truncate text-[17px] font-semibold">{shown?.name ?? tx("Крутите шкалу")}</div>
        <div className="relative mt-0.5 h-5 overflow-hidden text-[13px] text-muted">
          <div className={cn("whitespace-nowrap", npLine(np).length > 38 && "animate-[marquee_14s_linear_infinite]")}>
            {npLine(np) || (shown ? [shown.country, shown.tags.slice(0, 3).join(" · ")].filter(Boolean).join(" · ") : "")}
          </div>
        </div>
      </div>
      {/* Dial */}
      <div className="relative h-[86px] border-t border-line">
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-0.5 -translate-x-1/2 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-bg to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-bg to-transparent" />
        <div
          ref={scroller}
          onScroll={onScroll}
          onTouchMove={markUser}
          onWheel={markUser}
          className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto"
          style={{ paddingInline: `calc(50% - ${ITEM / 2}px)` }}
        >
          {dial.map((s) => {
            const hot = (r.matches[s.id]?.score ?? 0) >= 50;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  userScroll.current = false;
                  r.tune(s);
                }}
                className="flex shrink-0 snap-center flex-col items-center justify-end pb-2"
                style={{ width: ITEM }}
              >
                <div className="mb-1 flex h-9 items-end gap-[5px]">
                  {[10, 16, 10, 22, 10, 16, 10].map((h, k) => (
                    <span key={k} className={cn("w-px", hot ? "bg-amber-300" : "bg-fg/30")} style={{ height: k === 3 ? (hot ? 30 : 22) : h }} />
                  ))}
                </div>
                <span className={cn("font-mono text-[11px] tabular-nums", hot ? "text-amber-300" : "text-subtle")}>
                  {pseudoFrequency(s.id)}
                </span>
                <span className="w-full truncate px-1 text-[10px] text-subtle">{s.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Page ---------------- */

export default function RadioPage() {
  const r = useRadio();
  const tags = useLibrary((s) => s.radioTags);
  const toggleTag = useLibrary((s) => s.toggleRadioTag);
  const favs = useLibrary((s) => s.radioFavs);
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 350);
  const found = useApi<{ stations: Station[] }>(dq ? `/api/radio/search?q=${encodeURIComponent(dq)}&limit=30` : null, { keep: true });

  return (
    <div className="pb-4">
      <header className="flex flex-wrap items-end justify-between gap-3 px-4 pt-6 pb-4 md:px-0">
        <div>
          <div className="flex items-center gap-2 whitespace-nowrap text-[13px] text-subtle">
            <RadioTower className="h-4 w-4 shrink-0" /> {tx("Крутите шкалу или выберите станцию")}
          </div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight md:text-[34px]">{tx("Эфир")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={r.refresh}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-muted"
            aria-label={tx("Обновить")}
          >
            {r.poolLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <Tuner />

      {favs.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-1 px-4 text-[19px] font-bold tracking-tight md:px-0">{tx("Мои станции")}</h2>
          <div className="md:grid md:grid-cols-2 md:gap-x-4">
            {favs.map((s) => (
              <StationRow key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-7">
        <h2 className="mb-2 px-4 text-[19px] font-bold tracking-tight md:px-0">{tx("Ваши жанры")}</h2>
        <div className="flex flex-wrap gap-2 px-4 md:px-0">
          {[...RADIO_GENRES, ...RADIO_ERAS].map((g) => {
            const on = tags.includes(g.tag);
            return (
              <button
                key={g.tag}
                type="button"
                onClick={() => toggleTag(g.tag)}
                aria-pressed={on}
                className={cn(
                  "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors",
                  on ? "border-fg bg-fg text-bg" : "border-line bg-card text-muted hover:text-fg",
                )}
              >
                {tx(g.label)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-7">
        <div className="mb-1 flex items-end justify-between px-4 md:px-0">
          <h2 className="text-[19px] font-bold tracking-tight">{tx("Что сейчас играет")}</h2>
        </div>
        {r.poolLoading && !r.pool.length ? (
          <div className="space-y-2 px-4 md:px-0">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-14 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="md:grid md:grid-cols-2 md:gap-x-4">
            {r.ranked.map((s) => (
              <StationRow key={s.id} s={s} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-7">
        <h2 className="mb-2 px-4 text-[19px] font-bold tracking-tight md:px-0">{tx("Найти станцию")}</h2>
        <p className="mb-2 px-4 text-[12.5px] text-subtle md:px-0">{tx("Весь каталог — в разделе «Обзор».")}</p>
        <div className="mx-4 flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:border-line-strong md:mx-0 md:max-w-md">
          <SearchIcon className="h-[18px] w-[18px] text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tx("Название станции")}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-subtle"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} className="text-muted" aria-label={tx("Очистить")}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {dq && (
          <div className={cn("mt-2 md:grid md:grid-cols-2 md:gap-x-4", found.stale && "opacity-60")}>
            {found.data?.stations.map((s) => (
              <StationRow key={s.id} s={s} />
            ))}
            {found.data && !found.data.stations.length && (
              <p className="px-4 py-6 text-center text-sm text-subtle">{tx("Ничего не найдено")}</p>
            )}
          </div>
        )}
      </section>

      <p className="mx-4 mt-8 text-[11.5px] leading-relaxed text-subtle md:mx-0">
        {tx("Каталог станций — Radio Browser (radio-browser.info). Звук идёт напрямую от радиостанций.")}
      </p>
    </div>
  );
}
