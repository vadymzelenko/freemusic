"use client";

import { tx } from "@/lib/i18n";
import { BarChart3, Clock3, Disc3, Flame, Music2, SkipForward, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { Cover } from "@/components/ui/Cover";
import { SongCover } from "@/components/radio/SongCover";
import { cn } from "@/lib/cn";
import type { Track } from "@/lib/types";
import { useHydrated, useLibrary } from "@/store/library";

type Period = 7 | 30 | 0;
const DAY = 864e5;
const WEEKDAY_KEYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return tx("{m} мин", { m });
  return tx("{h} ч {m} мин", { h, m });
}

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/* ---------- tiny single-series bar chart with hover/tap tooltip ---------- */

function Bars({
  values,
  labels,
  format,
  height = 120,
  tickEvery = 1,
  label,
}: {
  values: number[];
  labels: string[];
  format: (v: number) => string;
  height?: number;
  tickEvery?: number;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  return (
    <figure aria-label={label}>
      <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {/* recessive baseline */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-line" />
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {values.map((v, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${labels[i]}: ${format(v)}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => setHover(hover === i ? null : i)}
              className="group relative flex h-full flex-1 items-end"
            >
              {/* hit target is the full column; the mark is thin with a rounded data end */}
              <span
                className={cn(
                  "block w-full rounded-t-[4px] transition-colors",
                  hover === i ? "bg-fg" : "bg-fg/55 group-hover:bg-fg/80",
                )}
                style={{ height: v > 0 ? `${Math.max(2, (v / max) * 100)}%` : 0 }}
              />
            </button>
          ))}
        </div>
        {hover !== null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-[12px] shadow-lg"
            style={{ left: `${((hover + 0.5) / values.length) * 100}%` }}
          >
            <div className="text-subtle">{labels[hover]}</div>
            <div className="font-semibold tabular-nums text-fg">{format(values[hover]!)}</div>
          </div>
        )}
      </div>
      {/* tick labels are positioned, not squeezed into the bar columns */}
      <div className="relative mt-1.5 h-4 text-[10.5px] tabular-nums text-subtle">
        {labels.map((l, i) =>
          i % tickEvery === 0 ? (
            <span
              key={i}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${((i + 0.5) / labels.length) * 100}%` }}
            >
              {l}
            </span>
          ) : null,
        )}
      </div>
    </figure>
  );
}

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="flex items-center gap-2 text-[12.5px] text-muted [&>svg]:h-4 [&>svg]:w-4">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-[26px] font-bold leading-none tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[12px] text-subtle">{sub}</div>}
    </div>
  );
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-line bg-card p-4", className)}>
      <h2 className="mb-4 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function StatsPage() {
  const WEEKDAYS = WEEKDAY_KEYS.map((d) => tx(d));
  const hydrated = useHydrated();
  const plays = useLibrary((s) => s.plays);
  const tracks = useLibrary((s) => s.tracks);
  const likes = useLibrary((s) => s.likedIds.length);
  const dislikes = useLibrary((s) => s.dislikedIds.length);
  const stations = useLibrary((s) => s.radioHistory.length);
  const [period, setPeriod] = useState<Period>(30);

  const st = useMemo(() => {
    const now = Date.now();
    const from = period ? startOfDay(now) - (period - 1) * DAY : 0;
    const list = plays.filter((p) => p.at >= from);
    const seconds = list.reduce((s, p) => s + p.s, 0);
    const uniqTracks = new Set(list.map((p) => p.t));
    const completed = list.filter((p) => p.c).length;
    const skipped = list.filter((p) => p.k).length;

    // per artist (display name from the track metadata)
    const byArtist = new Map<string, { name: string; sec: number; plays: number; cover?: string }>();
    const byTrack = new Map<string, { plays: number; sec: number }>();
    for (const p of list) {
      const t = tracks[p.t];
      const name = t ? t.artist.split(",")[0]!.trim() : p.a;
      const a = byArtist.get(p.a) ?? { name, sec: 0, plays: 0, cover: t?.cover };
      a.sec += p.s;
      a.plays += 1;
      byArtist.set(p.a, a);
      const bt = byTrack.get(p.t) ?? { plays: 0, sec: 0 };
      bt.plays += 1;
      bt.sec += p.s;
      byTrack.set(p.t, bt);
    }
    const topArtists = [...byArtist.values()].sort((a, b) => b.sec - a.sec).slice(0, 8);
    const topTracks = [...byTrack.entries()]
      .map(([id, v]) => ({ track: tracks[id], ...v }))
      .filter((x): x is { track: Track; plays: number; sec: number } => !!x.track)
      .sort((a, b) => b.plays - a.plays || b.sec - a.sec)
      .slice(0, 10);

    // timeline: per day (7/30) or per week (all time, last 12 weeks)
    let timeline: { values: number[]; labels: string[]; tick: number };
    if (period) {
      const values = Array<number>(period).fill(0);
      for (const p of list) {
        const i = Math.floor((startOfDay(p.at) - from) / DAY);
        if (i >= 0 && i < period) values[i]! += p.s / 60;
      }
      const labels = values.map((_, i) => {
        const d = new Date(from + i * DAY);
        return period === 7 ? WEEKDAYS[(d.getDay() + 6) % 7]! : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
      });
      timeline = { values, labels, tick: period === 7 ? 1 : 5 };
    } else {
      const weeks = 12;
      const end = startOfDay(now) + DAY;
      const values = Array<number>(weeks).fill(0);
      for (const p of plays) {
        const i = weeks - 1 - Math.floor((end - p.at) / (7 * DAY));
        if (i >= 0) values[i]! += p.s / 60;
      }
      const labels = values.map((_, i) => {
        const d = new Date(end - (weeks - i) * 7 * DAY);
        return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
      });
      timeline = { values, labels, tick: 3 };
    }

    const hours = Array<number>(24).fill(0);
    const weekdays = Array<number>(7).fill(0);
    for (const p of list) {
      const d = new Date(p.at);
      hours[d.getHours()]! += p.s / 60;
      weekdays[(d.getDay() + 6) % 7]! += p.s / 60;
    }
    const peakHour = hours.indexOf(Math.max(...hours));

    // streak: consecutive days with listening, ending today or yesterday
    const days = new Set(plays.map((p) => startOfDay(p.at)));
    let streak = 0;
    let cursor = startOfDay(now);
    if (!days.has(cursor)) cursor -= DAY;
    while (days.has(cursor)) {
      streak++;
      cursor -= DAY;
    }

    return {
      count: list.length,
      seconds,
      uniqTracks: uniqTracks.size,
      uniqArtists: byArtist.size,
      completedPct: list.length ? Math.round((completed / list.length) * 100) : 0,
      skippedPct: list.length ? Math.round((skipped / list.length) * 100) : 0,
      topArtists,
      topTracks,
      timeline,
      hours,
      weekdays,
      peakHour,
      streak,
    };
  }, [plays, tracks, period]);

  const fmtMin = (m: number) => fmtDuration(Math.round(m * 60));
  const maxArtist = st.topArtists[0]?.sec ?? 1;

  return (
    <div className="px-4 md:px-0">
      <div className="-mx-2 pt-3 md:hidden">
        <BackButton />
      </div>
      <header className="flex flex-wrap items-end justify-between gap-3 pt-2 pb-4 md:pt-8">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight md:text-[34px]">{tx("Статистика")}</h1>
          <p className="text-[13px] text-muted">{tx("Песни, которые вы услышали в эфире")}</p>
        </div>
        {/* filters: one row above the charts */}
        <div className="flex rounded-xl border border-line bg-card p-1" role="tablist">
          {([7, 30, 0] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={cn(
                "h-8 rounded-lg px-3 text-[13px] font-medium transition-colors",
                period === p ? "bg-fg text-bg" : "text-muted hover:text-fg",
              )}
            >
              {p === 7 ? tx("7 дней") : p === 30 ? tx("30 дней") : tx("Всё время")}
            </button>
          ))}
        </div>
      </header>

      {hydrated && plays.length === 0 ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <BarChart3 className="h-10 w-10 text-subtle" />
          <p className="mt-3 text-[15px] font-medium">{tx("Пока нечего показать")}</p>
          <p className="mt-1 text-sm text-subtle">{tx("Слушайте радио — песни из эфира появятся здесь.")}</p>
        </div>
      ) : (
        <div className="space-y-3 md:space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <Tile icon={<Clock3 />} label={tx("Время")} value={fmtDuration(st.seconds)} sub={tx("{n} прослушиваний", { n: st.count })} />
            <Tile icon={<Music2 />} label={tx("Треков")} value={String(st.uniqTracks)} sub={tx("{likes} лайков · {dislikes} дизлайков", { likes, dislikes })} />
            <Tile icon={<UsersRound />} label={tx("Артистов")} value={String(st.uniqArtists)} sub={tx("{n} станций", { n: stations })} />
            <Tile
              icon={<Flame />}
              label={tx("Дней подряд")}
              value={String(st.streak)}
              sub={st.count ? tx("Чаще всего в {h}:00", { h: st.peakHour }) : undefined}
            />
          </div>

          <Card title={period ? tx("Минут в день") : tx("Минут в неделю")}>
            <Bars
              label={tx("Время прослушивания")}
              values={st.timeline.values}
              labels={st.timeline.labels}
              format={fmtMin}
              tickEvery={st.timeline.tick}
              height={140}
            />
          </Card>

          <div className="grid gap-3 md:grid-cols-2 md:gap-4">
            <Card title={tx("По времени суток")}>
              <Bars
                label={tx("По часам")}
                values={st.hours}
                labels={st.hours.map((_, h) => `${h}:00`)}
                format={fmtMin}
                tickEvery={6}
              />
            </Card>
            <Card title={tx("По дням недели")}>
              <Bars label={tx("По дням недели")} values={st.weekdays} labels={WEEKDAYS} format={fmtMin} />
            </Card>
          </div>

          <div className="grid gap-3 md:grid-cols-2 md:gap-4">
            <Card title={tx("Топ артистов")}>
              {st.topArtists.length === 0 && <p className="text-sm text-subtle">{tx("Нет данных за период")}</p>}
              <ol className="space-y-3">
                {st.topArtists.map((a, i) => (
                  <li key={a.name} className="flex items-center gap-3">
                    <span className="w-4 text-right text-[12px] tabular-nums text-subtle">{i + 1}</span>
                    <Cover src={a.cover} alt="" className="h-9 w-9" rounded="rounded-full" />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2 text-[14px]">
                        <span className="truncate font-medium">{a.name}</span>
                        <span className="shrink-0 tabular-nums text-muted">{fmtDuration(a.sec)}</span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-fg/10">
                        <div className="h-full rounded-full bg-fg/70" style={{ width: `${(a.sec / maxArtist) * 100}%` }} />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>

            <Card title={tx("Топ треков")}>
              {st.topTracks.length === 0 && <p className="text-sm text-subtle">{tx("Нет данных за период")}</p>}
              <ol className="space-y-1">
                {st.topTracks.map(({ track, plays: n }, i) => (
                  <li key={track.id}>
                    <div className="flex w-full items-center gap-3 rounded-lg py-1.5 text-left">
                      <span className="w-4 text-right text-[12px] tabular-nums text-subtle">{i + 1}</span>
                      <SongCover track={track} className="h-10 w-10" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium">{track.title}</div>
                        <div className="truncate text-[12.5px] text-muted">{track.artist}</div>
                      </div>
                      <span className="shrink-0 text-[12.5px] tabular-nums text-muted">×{n}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <Tile icon={<Disc3 />} label={tx("Услышано с начала")} value={`${st.completedPct}%`} />
            <Tile icon={<SkipForward />} label={tx("Переключили в первые 30 с")} value={`${st.skippedPct}%`} />
          </div>
        </div>
      )}
    </div>
  );
}
