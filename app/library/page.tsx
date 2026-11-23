"use client";

import { BarChart3, Heart, History, RadioTower, Settings, Star, ThumbsDown, ThumbsUp, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AccountCard } from "@/components/AccountCard";
import { PageHeader } from "@/components/PageHeader";
import { useRadio } from "@/components/radio/RadioProvider";
import { SongCover } from "@/components/radio/SongCover";
import { StationRow } from "@/components/radio/StationRow";
import { cn } from "@/lib/cn";
import { dateLocale, tx } from "@/lib/i18n";
import { songTrack } from "@/lib/radio/match";
import type { Station } from "@/lib/radio/types";
import type { Track } from "@/lib/types";
import { useHydrated, useLibrary } from "@/store/library";

type Tab = "stations" | "songs" | "history";

function ago(at: number): string {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return tx("только что");
  if (m < 60) return tx("{n} мин назад", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return tx("{n} ч назад", { n: h });
  return new Date(at).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" });
}

function Empty({ icon: Icon, title, text }: { icon: typeof Star; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <Icon className="h-10 w-10 text-subtle" />
      <p className="mt-3 text-[15px] font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-subtle">{text}</p>
    </div>
  );
}

/** Where is this song on air right now (among the stations being scanned)? */
function useOnAir(): Map<string, Station> {
  const r = useRadio();
  return useMemo(() => {
    const m = new Map<string, Station>();
    for (const s of r.pool) {
      const np = r.nowPlaying[s.id];
      if (np?.kind === "music" && np.artist) m.set(songTrack(np).id, s);
    }
    return m;
  }, [r.pool, r.nowPlaying]);
}

function SongRow({ t, right, onAir, sub }: { t: Track; right?: React.ReactNode; onAir?: Station; sub?: string }) {
  const r = useRadio();
  return (
    <div className="flex items-center gap-3 px-4 py-2 md:px-3">
      <SongCover track={t} className="h-12 w-12" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{t.title}</div>
        <div className="truncate text-[13px] text-muted">
          {t.artist}
          {sub && <span className="text-subtle"> · {sub}</span>}
        </div>
      </div>
      {onAir && (
        <button
          type="button"
          onClick={() => r.tune(onAir)}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-amber-400 px-3 text-[12px] font-semibold text-black"
          title={onAir.name}
        >
          <RadioTower className="h-3.5 w-3.5" /> {tx("в эфире")}
        </button>
      )}
      {right}
    </div>
  );
}

export default function LibraryPage() {
  const hydrated = useHydrated();
  const [tab, setTab] = useState<Tab>("stations");
  const favs = useLibrary((s) => s.radioFavs);
  const history = useLibrary((s) => s.radioHistory);
  const likedIds = useLibrary((s) => s.likedIds);
  const dislikedIds = useLibrary((s) => s.dislikedIds);
  const tracks = useLibrary((s) => s.tracks);
  const plays = useLibrary((s) => s.plays);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const toggleDislike = useLibrary((s) => s.toggleDislike);
  const onAir = useOnAir();

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "songs" || t === "history" || t === "stations") setTab(t);
  }, []);

  const liked = likedIds.map((id) => tracks[id]).filter((t): t is Track => !!t);
  const disliked = dislikedIds.map((id) => tracks[id]).filter((t): t is Track => !!t);
  const heard = useMemo(() => {
    const seen = new Set<string>();
    const out: { t: Track; at: number }[] = [];
    for (let i = plays.length - 1; i >= 0 && out.length < 50; i--) {
      const p = plays[i]!;
      const t = tracks[p.t];
      if (!t || seen.has(p.t)) continue;
      seen.add(p.t);
      out.push({ t, at: p.at });
    }
    return out;
  }, [plays, tracks]);

  const TABS: { id: Tab; label: string; icon: typeof Star; n: number }[] = [
    { id: "stations", label: tx("Станции"), icon: Star, n: favs.length },
    { id: "songs", label: tx("Песни"), icon: Heart, n: liked.length },
    { id: "history", label: tx("История"), icon: History, n: history.length },
  ];

  return (
    <div>
      <PageHeader title={tx("Медиатека")}>
        <div className="flex gap-2">
          <Link href="/stats" className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-muted active:bg-fg/10" aria-label={tx("Статистика")}>
            <BarChart3 className="h-4 w-4" />
          </Link>
          <Link href="/settings" className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-muted active:bg-fg/10" aria-label={tx("Настройки")}>
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </PageHeader>

      <div className="md:hidden">
        <AccountCard />
      </div>

      <div className="sticky top-[var(--safe-top)] z-20 mt-3 flex gap-2 bg-bg/90 px-4 py-2 backdrop-blur md:px-0" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition-colors",
              tab === t.id ? "border-fg bg-fg text-bg" : "border-line bg-card text-muted hover:text-fg",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {hydrated && t.n > 0 && <span className="text-[12px] opacity-60">{t.n}</span>}
          </button>
        ))}
      </div>

      {hydrated && tab === "stations" &&
        (favs.length ? (
          <div className="mt-2 md:grid md:grid-cols-2 md:gap-x-4">
            {favs.map((s) => (
              <StationRow key={s.id} s={s} />
            ))}
          </div>
        ) : (
          <Empty icon={Star} title={tx("Пока нет любимых станций")} text={tx("Нажмите на звёздочку у станции — она появится здесь и в умном радио.")} />
        ))}

      {hydrated && tab === "songs" && (
        <>
          {liked.length ? (
            <>
              <p className="mt-2 px-4 text-[12.5px] text-subtle md:px-0">
                {tx("Когда одна из этих песен начнётся в эфире, она окажется первой в очереди.")}
              </p>
              <div className="mt-1 md:grid md:grid-cols-2 md:gap-x-4">
                {liked.map((t) => (
                  <SongRow
                    key={t.id}
                    t={t}
                    onAir={onAir.get(t.id.startsWith("r:") ? t.id : songTrack(t).id)}
                    right={
                      <button type="button" onClick={() => toggleLike(t)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg" aria-label={tx("Убрать из любимых")}>
                        <ThumbsUp className="h-[18px] w-[18px] fill-current" />
                      </button>
                    }
                  />
                ))}
              </div>
            </>
          ) : (
            <Empty icon={Heart} title={tx("Нет любимых песен")} text={tx("Ставьте 👍 песням в эфире — потом мы поймаем их на других станциях.")} />
          )}
          {disliked.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-1 flex items-center gap-2 px-4 text-[17px] font-bold md:px-0">
                <ThumbsDown className="h-4 w-4" /> {tx("Не нравится")}
              </h2>
              <div className="md:grid md:grid-cols-2 md:gap-x-4">
                {disliked.map((t) => (
                  <SongRow
                    key={t.id}
                    t={t}
                    right={
                      <button type="button" onClick={() => toggleDislike(t)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-subtle hover:text-fg" aria-label={tx("Убрать")}>
                        <X className="h-[18px] w-[18px]" />
                      </button>
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {hydrated && tab === "history" &&
        (history.length || heard.length ? (
          <div className="md:grid md:grid-cols-2 md:gap-x-6">
            <section className="mt-2">
              <h2 className="mb-1 px-4 text-[17px] font-bold md:px-0">{tx("Станции")}</h2>
              {history.map((h) => (
                <StationRow key={h.s.id} s={h.s} sub={ago(h.at)} />
              ))}
            </section>
            <section className="mt-6 md:mt-2">
              <h2 className="mb-1 px-4 text-[17px] font-bold md:px-0">{tx("Песни из эфира")}</h2>
              {heard.map(({ t, at }) => (
                <SongRow
                  key={t.id}
                  t={t}
                  sub={ago(at)}
                  right={
                    <button
                      type="button"
                      onClick={() => toggleLike(t)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-subtle hover:text-fg"
                      aria-label={tx("Нравится")}
                    >
                      <ThumbsUp className={cn("h-[18px] w-[18px]", likedIds.includes(t.id) && "fill-current text-fg")} />
                    </button>
                  }
                />
              ))}
              {!heard.length && <p className="px-4 py-4 text-sm text-subtle md:px-0">{tx("Песни, которые прозвучат, пока вы слушаете, появятся здесь.")}</p>}
            </section>
          </div>
        ) : (
          <Empty icon={History} title={tx("История пуста")} text={tx("Здесь будут станции, которые вы слушали, и песни, что звучали в эфире.")} />
        ))}
    </div>
  );
}
