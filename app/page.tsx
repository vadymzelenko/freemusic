"use client";

import { Flame, Loader2, Pause, Play, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRadio } from "@/components/radio/RadioProvider";
import { HotCard, npLine, Shelf, StationRow, StationTile, TileSkeletons } from "@/components/radio/StationRow";
import { StationLogo } from "@/components/radio/StationLogo";
import { Logo } from "@/components/Sidebar";
import { tx } from "@/lib/i18n";
import { flag, tagLabel, type Station } from "@/lib/radio/types";
import { useApi } from "@/lib/use-api";
import { useHydrated, useLibrary } from "@/store/library";
import { useUI } from "@/store/ui";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return tx("Доброй ночи");
  if (h < 12) return tx("Доброе утро");
  if (h < 18) return tx("Добрый день");
  return tx("Добрый вечер");
}

function ApiShelf({ title, path, exclude }: { title: string; path: string; exclude?: Set<string> }) {
  const { data, error } = useApi<{ stations: Station[] }>(path);
  if (error || (data && !data.stations.length)) return null;
  const list = data?.stations.filter((s) => !exclude?.has(s.id)) ?? [];
  return (
    <Shelf
      title={title}
      action={
        <Link href={`/explore?${path.split("?")[1]?.replace(/&?limit=\d+/, "") ?? ""}`} className="text-[13px] font-medium text-muted hover:text-fg">
          {tx("Все")}
        </Link>
      }
    >
      {data ? list.map((s) => <StationTile key={s.id} s={s} />) : <TileSkeletons />}
    </Shelf>
  );
}

/** Big "your wave" card: plays the best station for you right now. */
function Hero() {
  const r = useRadio();
  const openPlayer = useUI((s) => s.setPlayerOpen);
  const best = r.ranked[0];
  if (r.station) {
    const np = r.current;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => openPlayer(true)}
        onKeyDown={(e) => e.key === "Enter" && openPlayer(true)}
        className="mx-4 flex cursor-pointer w-[calc(100%-2rem)] items-center gap-4 rounded-2xl border border-line bg-gradient-to-br from-fg/[0.08] to-card p-4 text-left md:mx-0 md:w-full"
      >
        <StationLogo station={r.station} className="h-16 w-16" rounded="rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-red-400">{r.playing ? tx("Сейчас играет") : tx("На паузе")}</div>
          <div className="truncate text-[17px] font-bold">{r.station.name}</div>
          <div className="truncate text-[13.5px] text-muted">{np?.kind === "ad" ? tx("Реклама") : npLine(np) || tx("Прямой эфир")}</div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            r.toggle();
          }}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-fg text-bg"
          aria-label={r.playing ? tx("Пауза") : tx("Играть")}
        >
          {r.playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={!best}
      onClick={() => best && r.tune(best)}
      className="relative mx-4 block w-[calc(100%-2rem)] overflow-hidden rounded-2xl p-5 text-left text-white md:mx-0 md:w-full"
      style={{ background: "linear-gradient(135deg, #f59e0b 0%, #ef4444 55%, #7c3aed 100%)" }}
    >
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
      <div className="relative flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-white/80">
            <Sparkles className="h-3.5 w-3.5" /> {tx("Ваша волна")}
          </div>
          <div className="mt-1 text-[22px] font-bold leading-tight">{tx("Включить радио под ваш вкус")}</div>
          <div className="mt-1 truncate text-[13.5px] text-white/80">
            {best ? `${best.name}${r.nowPlaying[best.id] ? ` · ${npLine(r.nowPlaying[best.id])}` : ""}` : tx("Подбираем станции…")}
          </div>
        </div>
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-xl">
          {best ? <Play className="ml-1 h-6 w-6 fill-current" /> : <Loader2 className="h-6 w-6 animate-spin" />}
        </span>
      </div>
    </button>
  );
}

export default function ForYouPage() {
  const hydrated = useHydrated();
  const r = useRadio();
  const tags = useLibrary((s) => s.radioTags);
  const prefs = useLibrary((s) => s.radioPrefs);
  const history = useLibrary((s) => s.radioHistory);
  const artists = useLibrary((s) => s.artists);

  const hot = r.ranked.filter((s) => (r.matches[s.id]?.score ?? 0) >= 50);
  const picks = r.ranked.filter((s) => !hot.includes(s)).slice(0, 8);
  const cc = prefs.countries[0];

  return (
    <div className="pb-4">
      <header className="flex items-center justify-between gap-3 px-4 pt-6 pb-5 md:px-0 md:pt-8">
        <div className="flex items-center gap-3">
          <Logo className="md:hidden" />
          <h1 className="text-[26px] font-bold leading-tight tracking-tight md:text-[34px]">{greeting()}</h1>
        </div>
        <Link href="/settings" className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-muted md:hidden" aria-label={tx("Настройки")}>
          <Settings className="h-4 w-4" />
        </Link>
      </header>

      <Hero />

      {hydrated && history.length > 0 && (
        <Shelf title={tx("Продолжить")}>
          {history.slice(0, 12).map((h) => (
            <StationTile key={h.s.id} s={h.s} />
          ))}
        </Shelf>
      )}

      {hot.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 flex items-center gap-2 px-4 text-[19px] font-bold tracking-tight md:px-0">
            <Flame className="h-5 w-5 text-amber-400" /> {tx("Ваше сейчас в эфире")}
          </h2>
          <p className="mb-3 px-4 text-[12.5px] text-subtle md:px-0">{tx("Ваши артисты и песни, которые играют прямо сейчас")}</p>
          <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:px-0">
            {hot.map((s) => (
              <HotCard key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-1 flex items-end justify-between px-4 md:px-0">
          <h2 className="text-[19px] font-bold tracking-tight">{tx("Подобрано для вас")}</h2>
          <Link href="/radio" className="text-[13px] font-medium text-muted hover:text-fg">
            {tx("Все {n}", { n: r.pool.length })}
          </Link>
        </div>
        <p className="mb-1 px-4 text-[12.5px] text-subtle md:px-0">
          {[tags.slice(0, 4).map((t) => tx(tagLabel(t))).join(", "), prefs.countries.map(flag).join(" ")].filter(Boolean).join(" · ")}
          {artists.length > 0 && ` · ${tx("{n} артистов", { n: artists.length })}`}
        </p>
        {r.poolLoading && !picks.length ? (
          <div className="space-y-2 px-4 md:px-0">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="skeleton h-14 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="md:grid md:grid-cols-2 md:gap-x-4">
            {picks.map((s) => (
              <StationRow key={s.id} s={s} />
            ))}
          </div>
        )}
      </section>

      {hydrated && (
        <>
          {cc && <ApiShelf title={tx("Популярное: {c}", { c: `${flag(cc)} ${cc}` })} path={`/api/radio/search?cc=${cc}&limit=16`} />}
          {tags.slice(0, 5).map((t, i) => (
            <ApiShelf
              key={t}
              title={tx(tagLabel(t))}
              path={`/api/radio/search?tag=${encodeURIComponent(t)}${i % 2 === 1 && cc ? `&cc=${cc}` : ""}&limit=16`}
            />
          ))}
          {prefs.countries.slice(1, 3).map((c) => (
            <ApiShelf key={c} title={tx("Популярное: {c}", { c: `${flag(c)} ${c}` })} path={`/api/radio/search?cc=${c}&limit=16`} />
          ))}
          <ApiShelf title={tx("В тренде по всему миру")} path="/api/radio/search?order=clicktrend&limit=16" />
        </>
      )}
    </div>
  );
}
