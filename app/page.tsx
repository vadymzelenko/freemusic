"use client";

import { Download, Play, Settings, Sparkles, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { ArtistCircle, MixCard, TrackCard } from "@/components/Cards";
import { TrackRow } from "@/components/TrackRow";
import { Shelf, ShelfSkeleton } from "@/components/ui/Shelf";
import { TrackListSkeleton } from "@/components/ui/Skeleton";
import { usePlayer } from "@/components/player/PlayerProvider";
import { buildProfile, daySeed, rank, topArtistKeys } from "@/lib/recommend";
import { artistKey, type MixPool, type Track } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { useHydrated, useLibrary } from "@/store/library";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

/** Stable per-day pick of n items from the top of a list (keeps the feed fresh but not jumpy). */
function pickDaily<T>(items: T[], n: number, seed: string, from = 10): T[] {
  const pool = items.slice(0, from);
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const out: T[] = [];
  const copy = [...pool];
  while (out.length < n && copy.length) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(copy.splice(h % copy.length, 1)[0]!);
  }
  return out;
}

export default function HomePage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const lib = useLibrary();
  const { playTracks, setRadio } = usePlayer();

  // First launch → pick artists.
  useEffect(() => {
    if (hydrated && !lib.onboarded && lib.artists.length === 0 && lib.likedIds.length === 0) {
      router.replace("/onboarding");
    }
  }, [hydrated, lib.onboarded, lib.artists.length, lib.likedIds.length, router]);

  const seed = daySeed();
  const profile = useMemo(
    () => buildProfile(lib),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lib.likedIds, lib.dislikedIds, lib.artists, lib.plays],
  );

  // Seeds for the candidate fetch: favourite artists (with ids) + a few liked / fully played tracks.
  const seeds = useMemo(() => {
    const idByKey = new Map<string, { id: string; name: string; thumbnail?: string }>();
    for (const a of lib.artists) if (a.id) idByKey.set(a.key, { id: a.id, name: a.name, thumbnail: a.thumbnail });
    for (const t of Object.values(lib.tracks)) {
      const k = artistKey(t.artist);
      if (t.artistId && !idByKey.has(k)) idByKey.set(k, { id: t.artistId, name: t.artist.split(",")[0]!.trim() });
    }
    const rankedArtists = [...new Set([...topArtistKeys(profile, 12), ...lib.artists.map((a) => a.key)])]
      .map((k) => idByKey.get(k))
      .filter((x): x is { id: string; name: string; thumbnail?: string } => !!x);
    const artists = pickDaily(rankedArtists, 5, seed, 10);

    const completed = [...lib.plays].reverse().filter((p) => p.c).map((p) => p.t);
    const trackPool = [...new Set([...lib.likedIds.slice(0, 15), ...completed.slice(0, 15)])].filter(
      (id) => !profile.disliked.has(id) && lib.tracks[id],
    );
    const tracks = pickDaily(trackPool, 3, seed, 12);
    return { artists, tracks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, lib.artists, lib.likedIds, seed]);

  const mixPath =
    hydrated && (seeds.artists.length || seeds.tracks.length)
      ? `/api/mix?a=${seeds.artists.map((a) => a.id).join(",")}&t=${seeds.tracks.join(",")}`
      : null;
  const mix = useApi<{ pools: MixPool[] }>(mixPath);
  const pools = mix.data?.pools ?? [];

  const all = useMemo(() => pools.flatMap((p) => p.tracks), [pools]);
  const quickPicks = useMemo(() => rank(all, profile, { limit: 24, personalize: 0.7, seed }), [all, profile, seed]);
  const myMix = useMemo(() => rank(all, profile, { limit: 60, personalize: 0.5, seed: seed + "mix", maxPerArtist: 5 }), [all, profile, seed]);
  const discover = useMemo(
    () =>
      rank(
        pools.filter((p) => p.kind === "track").flatMap((p) => p.tracks).filter((t) => !(profile.affinity.get(artistKey(t.artist)) ?? 0)),
        profile,
        { limit: 40, personalize: 0.2, seed: seed + "new", includeLiked: false, maxPerArtist: 2 },
      ),
    [pools, profile, seed],
  );

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (let i = lib.plays.length - 1; i >= 0 && out.length < 15; i--) {
      const p = lib.plays[i]!;
      const t = lib.tracks[p.t];
      if (t && !seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    }
    return out;
  }, [lib.plays, lib.tracks]);

  const liked = useMemo(() => lib.likedIds.map((id) => lib.tracks[id]).filter((t): t is Track => !!t), [lib.likedIds, lib.tracks]);
  const followed = lib.artists.filter((a) => a.id);

  const startMix = (list: Track[], i = 0) => {
    if (!list.length) return;
    setRadio(true);
    playTracks(list, i);
  };

  const hasSeeds = seeds.artists.length > 0 || seeds.tracks.length > 0;

  return (
    <div>
      <header className="flex items-end justify-between px-4 pt-6 pb-1">
        <div>
          <div className="text-[13px] text-subtle">{greeting()}</div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">Главная</h1>
        </div>
        <Link
          href="/settings"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card text-muted active:bg-white/10"
          aria-label="Настройки"
        >
          <Settings className="h-[18px] w-[18px]" />
        </Link>
      </header>

      {hydrated && !hasSeeds && (
        <div className="mx-4 mt-5 rounded-2xl border border-line bg-card p-5">
          <Sparkles className="h-6 w-6 text-muted" />
          <h2 className="mt-3 text-[17px] font-semibold">Настроим рекомендации</h2>
          <p className="mt-1 text-[14px] text-muted">Выберите любимых артистов или лайкните пару треков — главная наполнится миксами.</p>
          <Link href="/onboarding" className="mt-4 inline-flex h-10 items-center rounded-xl bg-fg px-4 text-[14px] font-semibold text-bg">
            Выбрать артистов
          </Link>
        </div>
      )}

      {mix.error && !mix.data && (
        <div className="mx-4 mt-5 flex items-start gap-3 rounded-xl border border-line bg-card p-4">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          <div className="text-[13.5px]">
            <p className="font-medium">Не удалось загрузить рекомендации</p>
            <p className="mt-0.5 text-subtle">{mix.error}</p>
            <Link href="/library/downloads" className="mt-2 inline-flex items-center gap-1.5 text-fg underline underline-offset-4">
              <Download className="h-3.5 w-3.5" /> Скачанное доступно офлайн
            </Link>
          </div>
        </div>
      )}

      {hasSeeds && !mix.data && !mix.error && (
        <>
          <ShelfSkeleton />
          <div className="mt-7">
            <div className="skeleton mx-4 mb-3 h-5 w-40 rounded" />
            <TrackListSkeleton count={4} />
          </div>
          <ShelfSkeleton />
        </>
      )}

      {pools.length > 0 && (
        <>
          <Shelf title="Ваши миксы">
            <MixCard
              title="Мой микс"
              subtitle="Всё, что вам нравится, и немного нового"
              covers={myMix.slice(0, 4).map((t) => t.cover)}
              onPlay={() => startMix(myMix)}
            />
            {discover.length >= 8 && (
              <MixCard
                title="Открытия"
                subtitle="Новые для вас артисты"
                covers={discover.slice(0, 4).map((t) => t.cover)}
                onPlay={() => startMix(discover)}
              />
            )}
            {pools
              .filter((p) => p.kind === "artist")
              .map((p) => {
                const list = rank(p.tracks, profile, { limit: 30, personalize: 0.3, seed });
                return (
                  <MixCard
                    key={p.seedId}
                    title={p.seedName}
                    subtitle={`Микс: ${p.seedName} и похожие`}
                    covers={[p.cover]}
                    onPlay={() => startMix(list)}
                  />
                );
              })}
          </Shelf>

          {quickPicks.length > 0 && (
            <section className="mt-7">
              <div className="mb-1 flex items-end justify-between px-4">
                <div>
                  <div className="text-[12px] font-medium uppercase tracking-[0.1em] text-subtle">Подобрано для вас</div>
                  <h2 className="text-[19px] font-bold tracking-tight">Быстрый выбор</h2>
                </div>
                <button
                  type="button"
                  onClick={() => startMix(quickPicks)}
                  className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-[13px] font-medium"
                >
                  <Play className="h-3.5 w-3.5 fill-current" /> Слушать
                </button>
              </div>
              {quickPicks.slice(0, 8).map((t, i) => (
                <TrackRow key={t.id} track={t} onPlay={() => startMix(quickPicks, i)} />
              ))}
            </section>
          )}

          {pools
            .filter((p) => p.kind === "track")
            .map((p) => {
              const seedTrack = lib.tracks[p.seedId];
              const list = rank(p.tracks, profile, { limit: 20, personalize: 0.3, seed });
              if (!list.length) return null;
              return (
                <Shelf key={p.seedId} subtitle="Потому что вам понравилось" title={seedTrack?.title ?? "этот трек"}>
                  {list.map((t, i) => (
                    <TrackCard key={t.id} track={t} onPlay={() => startMix(list, i)} />
                  ))}
                </Shelf>
              );
            })}
        </>
      )}

      {followed.length > 0 && (
        <Shelf title="Ваши артисты" href="/onboarding">
          {followed.map((a) => (
            <ArtistCircle key={a.key} artist={{ id: a.id!, name: a.name, thumbnail: a.thumbnail ?? "" }} width={104} />
          ))}
        </Shelf>
      )}

      {recent.length > 0 && (
        <Shelf title="Недавно слушали">
          {recent.map((t, i) => (
            <TrackCard key={t.id} track={t} onPlay={() => startMix(recent, i)} width={128} />
          ))}
        </Shelf>
      )}

      {liked.length > 0 && (
        <Shelf title="Любимые треки" href="/library/liked">
          {liked.slice(0, 15).map((t, i) => (
            <TrackCard key={t.id} track={t} onPlay={() => startMix(liked, i)} width={128} />
          ))}
        </Shelf>
      )}
    </div>
  );
}
