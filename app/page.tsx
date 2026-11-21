"use client";

import { tx } from "@/lib/i18n";
import { ChevronDown, Download, Loader2, Play, RefreshCw, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArtistCircle, MixCard, TrackCard } from "@/components/Cards";
import { TrackRow } from "@/components/TrackRow";
import { Shelf, ShelfSkeleton } from "@/components/ui/Shelf";
import { TrackRowSkeleton } from "@/components/ui/Skeleton";
import { usePlayer } from "@/components/player/PlayerProvider";
import { buildProfile, daySeed, rank, topArtistKeys, type Profile } from "@/lib/recommend";
import { artistKey, type ArtistPage, type Track } from "@/lib/types";
import { getJSON } from "@/lib/use-api";
import { useFeed, type SeedArtist } from "@/store/feed";
import { useHydrated, useLibrary } from "@/store/library";
import { useAuth } from "@/lib/cloud-sync";

const FEED_TTL = 6 * 60 * 60 * 1000;
const FIRST_ARTISTS = 4;
const FIRST_TRACKS = 3;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return tx("Доброй ночи");
  if (h < 12) return tx("Доброе утро");
  if (h < 18) return tx("Добрый день");
  return tx("Добрый вечер");
}

function shuffleStable<T>(items: T[], salt: string): T[] {
  let h = 0;
  for (const c of salt) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Ordered seed lists: favourite artists first (with some daily variety), then the long tail. */
function computeSeeds(profile: Profile, salt: string): { artists: SeedArtist[]; tracks: string[] } {
  const lib = useLibrary.getState();
  const byKey = new Map<string, SeedArtist>();
  for (const a of lib.artists) if (a.id) byKey.set(a.key, { id: a.id, name: a.name, thumbnail: a.thumbnail });
  for (const t of Object.values(lib.tracks)) {
    const k = artistKey(t.artist);
    if (t.artistId && !byKey.has(k)) byKey.set(k, { id: t.artistId, name: t.artist.split(",")[0]!.trim() });
  }
  const keys = [...new Set([...topArtistKeys(profile, 30), ...lib.artists.map((a) => a.key)])];
  const ranked = keys.map((k) => byKey.get(k)).filter((x): x is SeedArtist => !!x);
  const artists = [...shuffleStable(ranked.slice(0, 8), salt), ...shuffleStable(ranked.slice(8), salt)];

  const completed = [...lib.plays].reverse().filter((p) => p.c).map((p) => p.t);
  const pool = [...new Set([...lib.likedIds.slice(0, 30), ...completed.slice(0, 30)])].filter(
    (id) => !profile.disliked.has(id) && lib.tracks[id],
  );
  const tracks = [...shuffleStable(pool.slice(0, 12), salt), ...shuffleStable(pool.slice(12), salt)];
  return { artists, tracks };
}

/** Fetches candidate pools one by one — each row appears as soon as its data arrives. */
function loadPools(artists: SeedArtist[], tracks: string[]) {
  const feed = useFeed.getState();
  for (const a of artists) {
    feed.setLoading(1);
    getJSON<ArtistPage>(`/api/artist?id=${encodeURIComponent(a.id)}`)
      .then((page) => {
        if (page.songs.length) {
          useFeed.getState().addPool({
            kind: "artist",
            seedId: a.id,
            seedName: page.name || a.name,
            cover: page.thumbnail || a.thumbnail || page.songs[0]!.cover,
            tracks: page.songs.slice(0, 15),
          });
        }
      })
      .catch(() => {})
      .finally(() => useFeed.getState().setLoading(-1));
  }
  for (const id of tracks) {
    feed.setLoading(1);
    getJSON<{ tracks: Track[] }>(`/api/related?id=${encodeURIComponent(id)}`)
      .then((r) => {
        if (r.tracks.length) {
          useFeed.getState().addPool({
            kind: "track",
            seedId: id,
            seedName: useLibrary.getState().tracks[id]?.title ?? "",
            cover: r.tracks[0]!.cover,
            tracks: r.tracks.slice(0, 25),
          });
        }
      })
      .catch(() => {})
      .finally(() => useFeed.getState().setLoading(-1));
  }
}

export default function HomePage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const onboarded = useLibrary((s) => s.onboarded);
  const artistsCount = useLibrary((s) => s.artists.length);
  const likedCount = useLibrary((s) => s.likedIds.length);
  const libTracks = useLibrary((s) => s.tracks);
  const plays = useLibrary((s) => s.plays);
  const likedIds = useLibrary((s) => s.likedIds);
  const followedAll = useLibrary((s) => s.artists);
  const hidden = useLibrary((s) => s.hiddenSections);
  const show = (id: string) => !hidden.includes(id);
  const authLoaded = useAuth((s) => s.loaded);
  const { playTracks, setRadio } = usePlayer();

  const feed = useFeed();
  const [visible, setVisible] = useState(8);

  // First launch → pick artists.
  useEffect(() => {
    // wait for the cloud copy first — on a new device the account may already have artists
    if (hydrated && authLoaded && !onboarded && artistsCount === 0 && likedCount === 0) router.replace("/onboarding");
  }, [hydrated, authLoaded, onboarded, artistsCount, likedCount, router]);

  // Taste snapshot is frozen per feed build — liking a track doesn't reshuffle the page.
  const profile = useMemo(
    () => buildProfile(useLibrary.getState()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed.builtAt, hydrated],
  );

  const build = useCallback(() => {
    const salt = `${daySeed()}-${Math.random().toString(36).slice(2, 7)}`;
    const p = buildProfile(useLibrary.getState());
    const seeds = computeSeeds(p, salt);
    useFeed.getState().reset(daySeed(), salt, seeds.artists, seeds.tracks);
    setVisible(8);
    const first = useFeed.getState().takeSeeds(FIRST_ARTISTS, FIRST_TRACKS);
    loadPools(first.artists, first.tracks);
  }, []);

  // Build when stale (new day / 6h) or empty. Otherwise show the saved feed instantly.
  useEffect(() => {
    if (!hydrated || !authLoaded) return;
    const f = useFeed.getState();
    const stale = f.day !== daySeed() || Date.now() - f.builtAt > FEED_TTL;
    const empty = f.pools.length === 0 && f.loading === 0;
    if (stale || empty) build();
  }, [hydrated, authLoaded, build]);

  const loadMore = useCallback(() => {
    const more = useFeed.getState().takeSeeds(2, 2);
    loadPools(more.artists, more.tracks);
  }, []);

  const pools = feed.pools;
  const salt = feed.salt;
  const all = useMemo(() => pools.flatMap((p) => p.tracks), [pools]);
  const ranked = useMemo(() => rank(all, profile, { limit: 300, personalize: 0.7, seed: salt }), [all, profile, salt]);
  // Append-only: rows already on screen never move when more candidates arrive.
  const shownRef = useRef<{ salt: string; list: Track[] }>({ salt: "", list: [] });
  if (shownRef.current.salt !== salt) shownRef.current = { salt, list: [] };
  const shownIds = new Set(shownRef.current.list.map((t) => t.id));
  const quickPicks = [...shownRef.current.list, ...ranked.filter((t) => !shownIds.has(t.id))];
  useEffect(() => {
    shownRef.current = { salt, list: quickPicks.slice(0, visible) };
  });
  const myMix = useMemo(
    () => rank(all, profile, { limit: 80, personalize: 0.5, seed: salt + "mix", maxPerArtist: 6 }),
    [all, profile, salt],
  );
  const discover = useMemo(
    () =>
      rank(
        pools
          .filter((p) => p.kind === "track")
          .flatMap((p) => p.tracks)
          .filter((t) => !(profile.affinity.get(artistKey(t.artist)) ?? 0)),
        profile,
        { limit: 60, personalize: 0.2, seed: salt + "new", includeLiked: false, maxPerArtist: 2 },
      ),
    [pools, profile, salt],
  );
  const artistMixes = useMemo(
    () =>
      pools
        .filter((p) => p.kind === "artist")
        .map((p) => ({ pool: p, list: rank(p.tracks, profile, { limit: 30, personalize: 0.3, seed: salt }) })),
    [pools, profile, salt],
  );
  const trackRows = useMemo(
    () =>
      pools
        .filter((p) => p.kind === "track")
        .map((p) => ({ pool: p, list: rank(p.tracks, profile, { limit: 20, personalize: 0.3, seed: salt }) }))
        .filter((r) => r.list.length),
    [pools, profile, salt],
  );

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (let i = plays.length - 1; i >= 0 && out.length < 15; i--) {
      const t = libTracks[plays[i]!.t];
      if (t && !seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    }
    return out;
  }, [plays, libTracks]);
  const liked = useMemo(() => likedIds.map((id) => libTracks[id]).filter((t): t is Track => !!t), [likedIds, libTracks]);
  const followed = followedAll.filter((a) => a.id);

  const startMix = (list: Track[], i = 0) => {
    if (!list.length) return;
    setRadio(true);
    playTracks(list, i);
  };

  const showMore = () => {
    const nextVisible = visible + 8;
    setVisible(nextVisible);
    // running low on candidates → fetch more pools in the background
    if (nextVisible + 8 >= quickPicks.length) loadMore();
  };

  const hasSeedsPossible = artistsCount > 0 || likedCount > 0 || plays.length > 0;
  const canLoadMore = feed.pendingArtists.length > 0 || feed.pendingTracks.length > 0;
  const busy = feed.loading > 0;

  if (!hydrated) {
    return (
      <div className="pt-6">
        <div className="skeleton mx-4 h-8 w-40 rounded" />
        <ShelfSkeleton />
      </div>
    );
  }

  return (
    <div>
      <header className="flex items-end justify-between px-4 pt-6 pb-1">
        <div>
          <div className="text-[13px] text-subtle">{greeting()}</div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">{tx("Главная")}</h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={build}
            disabled={busy}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card text-muted active:bg-fg/10 disabled:opacity-60"
            aria-label={tx("Обновить подборку")}
          >
            <RefreshCw className={`h-[17px] w-[17px] ${busy ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/settings"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card text-muted active:bg-fg/10"
            aria-label={tx("Настройки")}
          >
            <Settings className="h-[18px] w-[18px]" />
          </Link>
        </div>
      </header>

      {!hasSeedsPossible && (
        <div className="mx-4 mt-5 rounded-2xl border border-line bg-card p-5">
          <Sparkles className="h-6 w-6 text-muted" />
          <h2 className="mt-3 text-[17px] font-semibold">{tx("Настроим рекомендации")}</h2>
          <p className="mt-1 text-[14px] text-muted">{tx("Выберите любимых артистов или лайкните пару треков — главная наполнится миксами.")}</p>
          <Link href="/onboarding" className="mt-4 inline-flex h-10 items-center rounded-xl bg-fg px-4 text-[14px] font-semibold text-bg">
            {tx("Выбрать артистов")}
          </Link>
        </div>
      )}

      {hasSeedsPossible && !busy && pools.length === 0 && (
        <div className="mx-4 mt-5 rounded-xl border border-line bg-card p-4 text-[13.5px]">
          <p className="font-medium">{tx("Не удалось загрузить рекомендации")}</p>
          <div className="mt-2 flex gap-4">
            <button type="button" onClick={build} className="text-fg underline underline-offset-4">
              {tx("Повторить")}
            </button>
            <Link href="/library/downloads" className="inline-flex items-center gap-1.5 text-muted underline underline-offset-4">
              <Download className="h-3.5 w-3.5" />{tx(" Скачанное")}
            </Link>
          </div>
        </div>
      )}

      {/* Mixes */}
      {!show("mixes") ? null : pools.length > 0 ? (
        <Shelf title={tx("Ваши миксы")}>
          <MixCard
            title={tx("Мой микс")}
            subtitle={tx("Всё, что вам нравится, и немного нового")}
            covers={myMix.slice(0, 4).map((t) => t.cover)}
            onPlay={() => startMix(myMix)}
          />
          {discover.length >= 8 && (
            <MixCard
              title={tx("Открытия")}
              subtitle={tx("Новые для вас артисты")}
              covers={discover.slice(0, 4).map((t) => t.cover)}
              onPlay={() => startMix(discover)}
            />
          )}
          {artistMixes.map(({ pool, list }) => (
            <MixCard
              key={pool.seedId}
              title={pool.seedName}
              subtitle={tx("Микс: {name} и похожие", { name: pool.seedName })}
              covers={[pool.cover]}
              onPlay={() => startMix(list)}
            />
          ))}
        </Shelf>
      ) : (
        busy && <ShelfSkeleton />
      )}

      {/* Quick picks with "show more" */}
      {show("quick") && (quickPicks.length > 0 || busy) && (
        <section className="mt-7">
          <div className="mb-1 flex items-end justify-between px-4">
            <div>
              <div className="text-[12px] font-medium uppercase tracking-[0.1em] text-subtle">{tx("Подобрано для вас")}</div>
              <h2 className="text-[19px] font-bold tracking-tight">{tx("Быстрый выбор")}</h2>
            </div>
            {quickPicks.length > 0 && (
              <button
                type="button"
                onClick={() => startMix(quickPicks)}
                className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-[13px] font-medium"
              >
                <Play className="h-3.5 w-3.5 fill-current" />{tx(" Слушать")}
              </button>
            )}
          </div>
          <div className="lg:grid lg:grid-cols-2 lg:gap-x-4">
            {quickPicks.slice(0, visible).map((t, i) => (
              <TrackRow key={t.id} track={t} onPlay={() => startMix(quickPicks, i)} />
            ))}
          </div>
          {quickPicks.length === 0 && busy && (
            <>
              <TrackRowSkeleton />
              <TrackRowSkeleton />
              <TrackRowSkeleton />
            </>
          )}
          {(visible < quickPicks.length || canLoadMore) && quickPicks.length > 0 && (
            <div className="px-4 pt-2 lg:max-w-sm">
              <button
                type="button"
                onClick={showMore}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-line bg-card text-[14px] font-medium text-fg/90 active:bg-fg/10"
              >
                {busy && visible >= quickPicks.length ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                {tx("Показать ещё")}
              </button>
            </div>
          )}
        </section>
      )}

      {show("because") && trackRows.map(({ pool, list }) => (
        <Shelf key={pool.seedId} subtitle={tx("Потому что вам понравилось")} title={pool.seedName || tx("этот трек")}>
          {list.map((t, i) => (
            <TrackCard key={t.id} track={t} onPlay={() => startMix(list, i)} />
          ))}
        </Shelf>
      ))}

      {show("artists") && followed.length > 0 && (
        <Shelf title={tx("Ваши артисты")} href="/onboarding">
          {followed.map((a) => (
            <ArtistCircle key={a.key} artist={{ id: a.id!, name: a.name, thumbnail: a.thumbnail ?? "" }} width={104} />
          ))}
        </Shelf>
      )}

      {show("recent") && recent.length > 0 && (
        <Shelf title={tx("Недавно слушали")}>
          {recent.map((t, i) => (
            <TrackCard key={t.id} track={t} onPlay={() => startMix(recent, i)} width={128} />
          ))}
        </Shelf>
      )}

      {show("liked") && liked.length > 0 && (
        <Shelf title={tx("Любимые треки")} href="/library/liked">
          {liked.slice(0, 15).map((t, i) => (
            <TrackCard key={t.id} track={t} onPlay={() => startMix(liked, i)} width={128} />
          ))}
        </Shelf>
      )}

      {canLoadMore && pools.length > 0 && (
        <div className="px-4 pt-8">
          <button
            type="button"
            onClick={loadMore}
            disabled={busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-card text-[14px] font-medium disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {tx("Ещё подборки")}
          </button>
        </div>
      )}
    </div>
  );
}
