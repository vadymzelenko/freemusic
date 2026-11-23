"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type Hls from "hls.js";
import { initCloudSync } from "@/lib/cloud-sync";
import { tx } from "@/lib/i18n";
import { buildTaste, isSong, matchNowPlaying, songTrack, type Match, type Taste } from "@/lib/radio/match";
import type { NowPlaying, Station } from "@/lib/radio/types";
import { fetchJSON, getJSON } from "@/lib/use-api";
import { initLibrarySync, useHydrated, useLibrary } from "@/store/library";
import { useUI } from "@/store/ui";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * One song that is on air right now somewhere. The scanner keeps a single queue of these
 * for all stations in your pool; the UI and "next" only ever pick from it.
 */
export interface QueueItem {
  /** station id + song — changes when the station starts another song */
  key: string;
  station: Station;
  np: NowPlaying;
  /** when the song started (estimated between two scans); null = was already playing when first seen */
  startedAt: number | null;
  match: Match;
  /** 2 = your track, 1 = your artist, 0 = your genres, -1 = heard recently */
  tier: number;
}

export interface SwitchEvent {
  to: Station;
  np: NowPlaying | null;
  /** why we switched */
  kind: "track" | "artist" | "ad" | "talk" | "disliked" | "next";
  at: number;
}

interface RadioCtx {
  station: Station | null;
  /** a station is loaded (shows the bottom bar) */
  active: boolean;
  /** what's on air on the current station right now */
  current: NowPlaying | null;
  playing: boolean;
  buffering: boolean;
  error: string | null;
  pool: Station[];
  poolLoading: boolean;
  nowPlaying: Record<string, NowPlaying | null>;
  /** song start per station (see QueueItem.startedAt) */
  since: Record<string, number | null>;
  matches: Record<string, Match>;
  /** stations sorted by what they play for you right now */
  ranked: Station[];
  /** songs on air, best first (filter by age with `freshOnly`) */
  queue: QueueItem[];
  /** your song / artist just started elsewhere (auto-switch off) */
  suggestion: QueueItem | null;
  dismissSuggestion: () => void;
  /** station currently being checked before switching to it */
  checking: string | null;
  lastSwitch: SwitchEvent | null;
  /** seconds you can go back on this station (HLS timeshift), 0 = live only */
  rewindWindow: number;
  /** how far behind live you are, seconds */
  behindLive: number;
  tune: (s: Station) => void;
  /** check that the song is still on, then switch to it */
  playItem: (it: QueueItem) => Promise<boolean>;
  toggle: () => void;
  stop: () => void;
  /** next song from the queue */
  next: () => void;
  /** previous station */
  prev: () => void;
  seekBack: (sec: number) => void;
  goLive: () => void;
  refresh: () => void;
}

const Ctx = createContext<RadioCtx | null>(null);

export function useRadio(): RadioCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRadio must be used inside <RadioProvider>");
  return c;
}

/** Songs that started at most `freshness` seconds ago (0 = all songs on air). */
export function freshOnly(queue: QueueItem[], freshness: number, now: number): QueueItem[] {
  if (!freshness) return queue;
  return queue.filter((q) => q.startedAt !== null && now - q.startedAt <= freshness * 1000);
}

/* ------------------------------------------------------------------ */
/* Tuning static — a short burst of filtered noise, like a real dial   */
/* ------------------------------------------------------------------ */

let audioCtx: AudioContext | null = null;
function tuningStatic() {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    const len = Math.floor(ctx.sampleRate * 0.3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1800;
    band.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0.07;
    src.connect(band).connect(gain).connect(ctx.destination);
    src.start();
  } catch {
    /* no WebAudio — silent tuning */
  }
}

/* ------------------------------------------------------------------ */
/* Queue building                                                      */
/* ------------------------------------------------------------------ */

const POOL_PER_TAG = 16;
const POOL_PER_COUNTRY = 14;
const MAX_POOL = 100;
const CHUNK = 50;
/** the station you're listening to is checked this often — that's how ad breaks are caught */
const CURRENT_POLL_MS = 6_000;

/** How often to rescan the pool: the shorter the "fresh" window, the more precise start times must be. */
function scanEvery(freshness: number): number {
  if (freshness && freshness <= 15) return 6_000;
  if (freshness && freshness <= 60) return 10_000;
  return 20_000;
}

function buildQueue(
  pool: Station[],
  nowPlaying: Record<string, NowPlaying | null>,
  since: Record<string, number | null>,
  taste: Taste,
  favIds: Set<string>,
  recentSongs: Set<string>,
): QueueItem[] {
  const out: QueueItem[] = [];
  for (const s of pool) {
    const np = nowPlaying[s.id];
    if (!isSong(np)) continue;
    const match = matchNowPlaying(np, taste);
    if (match.score < 0) continue; // songs / artists you don't want
    let tier = match.kind === "track" ? 2 : match.kind === "artist" ? 1 : 0;
    if (tier < 2 && recentSongs.has(songTrack(np).id)) tier = -1;
    out.push({ key: `${s.id}|${np.raw}`, station: s, np, startedAt: since[s.id] ?? null, match, tier: tier + (favIds.has(s.id) && tier === 0 ? 0.5 : 0) });
  }
  // yours first, then the songs that started most recently
  return out.sort((a, b) => b.tier - a.tier || (b.startedAt ?? 0) - (a.startedAt ?? 0) || b.station.votes - a.station.votes);
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export function RadioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const radioTags = useLibrary((s) => s.radioTags);
  const radioFavs = useLibrary((s) => s.radioFavs);
  const likedIds = useLibrary((s) => s.likedIds);
  const dislikedIds = useLibrary((s) => s.dislikedIds);
  const followed = useLibrary((s) => s.artists);
  const plays = useLibrary((s) => s.plays);
  const countries = useLibrary((s) => s.radioPrefs.countries);
  const freshness = useLibrary((s) => s.radioPrefs.freshness);

  const [station, setStation] = useState<Station | null>(null);
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pool, setPool] = useState<Station[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<Record<string, NowPlaying | null>>({});
  const [since, setSince] = useState<Record<string, number | null>>({});
  const [lastSwitch, setLastSwitch] = useState<SwitchEvent | null>(null);
  const [rewindWindow, setRewindWindow] = useState(0);
  const [behindLive, setBehindLive] = useState(0);
  const [checking, setChecking] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const stationRef = useRef<Station | null>(null);
  const lastAutoAt = useRef(0);
  const sinceRef = useRef<Record<string, number | null>>({});
  const rawRef = useRef<Record<string, string>>({});
  const seenRef = useRef<Record<string, number>>({});
  const npRef = useRef<Record<string, NowPlaying | null>>({});
  const backRef = useRef<Station[]>([]);
  /** the song on the current station + when we started hearing it — for listening history */
  const heardRef = useRef<{ np: NowPlaying; from: number; startedFresh: boolean } | null>(null);

  /* ---------------- boot: local storage + cloud sync, restore last station ---------------- */

  useEffect(() => {
    const stopLocal = initLibrarySync();
    const stopCloud = initCloudSync();
    return () => {
      stopLocal();
      stopCloud();
    };
  }, []);

  const hydrated = useHydrated();
  useEffect(() => {
    if (!hydrated || stationRef.current) return;
    const last = useLibrary.getState().radioHistory[0];
    if (last) {
      // show it paused in the bar — one tap to resume (browsers block autoplay anyway)
      stationRef.current = last.s;
      setStation(last.s);
      setActive(true);
    }
  }, [hydrated]);

  /* ---------------- taste & queue ---------------- */

  const taste = useMemo(
    () => buildTaste(useLibrary.getState()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [likedIds, dislikedIds, followed],
  );

  const matches = useMemo(() => {
    const out: Record<string, Match> = {};
    for (const s of pool) out[s.id] = matchNowPlaying(nowPlaying[s.id], taste);
    return out;
  }, [pool, nowPlaying, taste]);

  const recentSongs = useMemo(() => {
    const from = Date.now() - 3 * 60 * 60 * 1000;
    return new Set(plays.filter((p) => p.at >= from).map((p) => p.t));
  }, [plays]);

  const queue = useMemo(
    () => buildQueue(pool, nowPlaying, since, taste, new Set(radioFavs.map((f) => f.id)), recentSongs),
    [pool, nowPlaying, since, taste, radioFavs, recentSongs],
  );
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const ranked = useMemo(() => {
    const favIds = new Set(radioFavs.map((f) => f.id));
    const val = (s: Station) => (matches[s.id]?.score ?? 0) + (favIds.has(s.id) ? 5 : 0) + (isSong(nowPlaying[s.id]) ? 1 : 0);
    return [...pool].sort((a, b) => val(b) - val(a) || b.votes - a.votes);
  }, [pool, matches, radioFavs, nowPlaying]);

  /* ---------------- pool: favourites + top stations of your genres / countries ---------------- */

  const loadPool = useCallback(async () => {
    setPoolLoading(true);
    try {
      const urls = [
        ...radioTags.map((tag) => `/api/radio/search?tag=${encodeURIComponent(tag)}&limit=${POOL_PER_TAG}`),
        ...countries.slice(0, 3).map((cc, i) => {
          const tag = radioTags[i % Math.max(1, radioTags.length)];
          return `/api/radio/search?cc=${cc}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}&limit=${POOL_PER_COUNTRY}`;
        }),
      ];
      const lists = await Promise.allSettled(urls.map((u) => getJSON<{ stations: Station[] }>(u)));
      // interleave so every genre / country gets a fair share of the pool
      const flat: Station[] = [];
      const cols = lists.map((l) => (l.status === "fulfilled" ? l.value.stations : []));
      for (let i = 0; i < 20; i++) for (const c of cols) if (c[i]) flat.push(c[i]!);
      const st = useLibrary.getState();
      const seen = new Set<string>();
      const out: Station[] = [];
      // HLS stations don't send song titles — they can't feed the song queue
      for (const s of [...st.radioFavs, ...st.radioHistory.slice(0, 6).map((h) => h.s), ...flat.filter((s) => !s.hls)]) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        out.push(s);
      }
      setPool(out.slice(0, MAX_POOL));
    } finally {
      setPoolLoading(false);
    }
  }, [radioTags, countries]);

  useEffect(() => {
    void loadPool();
  }, [loadPool]);

  /* ---------------- scan results ---------------- */

  /** merge fresh now-playing data; a changed title means a new song just started */
  const ingest = useCallback((items: Record<string, NowPlaying | null>) => {
    const now = Date.now();
    const nextSince = { ...sinceRef.current };
    for (const [id, np] of Object.entries(items)) {
      const raw = np?.raw ?? "";
      const prev = rawRef.current[id];
      const prevSeen = seenRef.current[id];
      if (prev === undefined) nextSince[id] = null; // first look: song was already on
      else if (prev !== raw) nextSince[id] = raw ? (prevSeen ? Math.round((prevSeen + now) / 2) : now) : null;
      rawRef.current[id] = raw;
      seenRef.current[id] = now;
    }
    sinceRef.current = nextSince;
    npRef.current = { ...npRef.current, ...items };
    setSince(nextSince);
    setNowPlaying((old) => ({ ...old, ...items }));
  }, []);

  const fetchNp = useCallback(async (ids: string[]) => {
    const r = await fetchJSON<{ items?: Record<string, NowPlaying | null> }>(`/api/radio/nowplaying?ids=${ids.join(",")}`);
    return r.items ?? {};
  }, []);

  /* ---------------- audio ---------------- */

  const attach = useCallback(async (s: Station) => {
    const a = audioRef.current;
    if (!a) return;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    setRewindWindow(0);
    setBehindLive(0);
    const nativeHls = a.canPlayType("application/vnd.apple.mpegurl") !== "";
    if (s.hls && !nativeHls) {
      const { default: HlsCtor } = await import("hls.js");
      if (HlsCtor.isSupported()) {
        const hls = new HlsCtor({ liveDurationInfinity: true, backBufferLength: 900, enableWorker: true });
        hls.loadSource(s.url);
        hls.attachMedia(a);
        hlsRef.current = hls;
        return;
      }
    }
    a.src = s.url;
  }, []);

  const applyMediaSession = useCallback((s: Station, np: NowPlaying | null) => {
    if (!("mediaSession" in navigator)) return;
    const song = isSong(np) ? np : null;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song?.title || s.name,
      artist: song?.artist || tx("Прямой эфир"),
      album: s.name,
      artwork: s.favicon ? [{ src: s.favicon, sizes: "512x512" }] : [],
    });
  }, []);

  /* ---------------- listening history (songs heard on air) ---------------- */

  const flushHeard = useCallback(() => {
    const h = heardRef.current;
    heardRef.current = null;
    if (!h) return;
    const listened = (Date.now() - h.from) / 1000;
    // a song you sat through from the start counts as "completed"
    useLibrary.getState().recordPlay(songTrack(h.np), listened, h.startedFresh && listened > 90);
  }, []);

  const noteCurrent = useCallback(
    (np: NowPlaying | null) => {
      const a = audioRef.current;
      if (!a || a.paused) return;
      const h = heardRef.current;
      if (h && h.np.raw === np?.raw) return;
      flushHeard();
      const cur = stationRef.current;
      if (isSong(np) && cur) heardRef.current = { np, from: Date.now(), startedFresh: sinceRef.current[cur.id] != null };
    },
    [flushHeard],
  );

  const tuneImpl = useCallback(
    (s: Station, opts: { quiet?: boolean } = {}) => {
      const a = audioRef.current;
      if (!a) return;
      if (!opts.quiet) tuningStatic();
      flushHeard();
      const prev = stationRef.current;
      if (prev && prev.id !== s.id) backRef.current = [prev, ...backRef.current.filter((x) => x.id !== prev.id)].slice(0, 30);
      stationRef.current = s;
      setStation(s);
      setActive(true);
      setError(null);
      setBuffering(true);
      void attach(s).then(() => {
        a.play().catch(() => setPlaying(false));
      });
      applyMediaSession(s, npRef.current[s.id] ?? null);
      useLibrary.getState().pushRadioHistory(s);
      // make sure the station is scanned even if it's not in the pool
      setPool((p) => (p.some((x) => x.id === s.id) ? p : [s, ...p].slice(0, MAX_POOL + 1)));
      setTimeout(() => {
        const np = npRef.current[s.id];
        if (np !== undefined) noteCurrent(np);
      }, 1200);
      fetch(`/api/radio/click?id=${encodeURIComponent(s.id)}`).catch(() => {});
    },
    [attach, applyMediaSession, flushHeard, noteCurrent],
  );

  const tune = useCallback((s: Station) => tuneImpl(s), [tuneImpl]);

  /**
   * Switch to the first candidate that is STILL playing music right now.
   * Each one is re-checked just before switching, so you never land on an ad or a DJ.
   */
  const switchChecked = useCallback(
    async (cands: QueueItem[], kind: SwitchEvent["kind"], opts: { quiet?: boolean; silent?: boolean } = {}): Promise<boolean> => {
      const t = buildTaste(useLibrary.getState());
      const tried = new Set<string>();
      for (const c of cands) {
        if (tried.has(c.station.id) || tried.size >= 4) continue;
        tried.add(c.station.id);
        setChecking(c.station.id);
        let np: NowPlaying | null | undefined;
        try {
          const items = await fetchNp([c.station.id]);
          ingest(items);
          np = items[c.station.id];
        } catch {
          np = c.np; // offline check failed — trust the last scan
        }
        if (isSong(np) && matchNowPlaying(np, t).score >= 0) {
          setChecking(null);
          tuneImpl(c.station, { quiet: opts.quiet });
          if (!opts.silent) setLastSwitch({ to: c.station, np, kind, at: Date.now() });
          return true;
        }
      }
      setChecking(null);
      return false;
    },
    [fetchNp, ingest, tuneImpl],
  );

  const playItem = useCallback(
    async (it: QueueItem) => {
      const ok = await switchChecked([it], "next", { silent: true });
      if (!ok) useUI.getState().showToast(tx("Песня на этой станции уже закончилась"));
      return ok;
    },
    [switchChecked],
  );

  /** candidates for "next": fresh songs first, never the current station */
  const candidates = useCallback((): QueueItem[] => {
    const cur = stationRef.current;
    const f = useLibrary.getState().radioPrefs.freshness;
    const all = queueRef.current.filter((q) => q.station.id !== cur?.id && q.tier >= 0);
    const fresh = freshOnly(all, f, Date.now());
    return [...fresh, ...all.filter((q) => !fresh.includes(q))];
  }, []);

  const next = useCallback(() => {
    void switchChecked(candidates(), "next", { silent: true }).then((ok) => {
      if (!ok) useUI.getState().showToast(tx("Сейчас нет подходящих песен — попробуйте через минуту"));
    });
  }, [switchChecked, candidates]);

  const prev = useCallback(() => {
    const s = backRef.current.shift();
    if (s) {
      const cur = stationRef.current;
      tuneImpl(s);
      // tuneImpl pushed `cur` onto the stack — drop it so prev keeps walking back
      if (cur) backRef.current = backRef.current.filter((x) => x.id !== cur.id);
    }
  }, [tuneImpl]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    const s = stationRef.current;
    if (!a || !s) return;
    if (a.paused) {
      setActive(true);
      // live radio: resume at the live edge unless the station lets us sit in the past
      if (!hlsRef.current && !a.seekable.length) void attach(s).then(() => a.play().catch(() => {}));
      else a.play().catch(() => {});
    } else {
      a.pause();
      flushHeard();
    }
  }, [attach, flushHeard]);

  const stop = useCallback(() => {
    flushHeard();
    const a = audioRef.current;
    a?.pause();
    hlsRef.current?.destroy();
    hlsRef.current = null;
    if (a) {
      a.removeAttribute("src");
      a.load();
    }
    setActive(false);
    setPlaying(false);
  }, [flushHeard]);

  const seekBack = useCallback((sec: number) => {
    const a = audioRef.current;
    if (!a || !a.seekable.length) return;
    const start = a.seekable.start(0);
    a.currentTime = Math.max(start + 1, a.currentTime - sec);
  }, []);

  const goLive = useCallback(() => {
    const a = audioRef.current;
    if (!a || !a.seekable.length) return;
    a.currentTime = a.seekable.end(a.seekable.length - 1) - 2;
  }, []);

  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  const nextRef = useRef(next);
  nextRef.current = next;
  const prevRef = useRef(prev);
  prevRef.current = prev;

  // audio element events
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onPlay = () => {
      setPlaying(true);
      const ms = "mediaSession" in navigator ? navigator.mediaSession : null;
      if (ms) {
        ms.playbackState = "playing";
        try {
          ms.setActionHandler("play", () => toggleRef.current());
          ms.setActionHandler("pause", () => toggleRef.current());
          ms.setActionHandler("nexttrack", () => nextRef.current());
          ms.setActionHandler("previoustrack", () => prevRef.current());
          ms.setActionHandler("seekto", null);
        } catch {
          /* ignore */
        }
      }
    };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => {
      setBuffering(false);
      setError(null);
    };
    const onError = () => {
      setBuffering(false);
      setPlaying(false);
      setError(tx("Станция не отвечает"));
    };
    const onTime = () => {
      if (!a.seekable.length) return;
      const start = a.seekable.start(0);
      const end = a.seekable.end(a.seekable.length - 1);
      const win = Number.isFinite(end - start) ? end - start : 0;
      setRewindWindow(win > 45 ? win : 0);
      setBehindLive(win > 45 ? Math.max(0, end - a.currentTime - 3) : 0);
    };
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("waiting", onWaiting);
    a.addEventListener("playing", onPlaying);
    a.addEventListener("error", onError);
    a.addEventListener("timeupdate", onTime);
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("waiting", onWaiting);
      a.removeEventListener("playing", onPlaying);
      a.removeEventListener("error", onError);
      a.removeEventListener("timeupdate", onTime);
    };
  }, []);

  /* ---------------- automatic decisions (only clear-cut ones) ---------------- */

  const decide = useCallback(() => {
    const cur = stationRef.current;
    const a = audioRef.current;
    if (!cur || !a || a.paused || checkingRef.current) return;
    const st = useLibrary.getState();
    const np = npRef.current[cur.id] ?? null;
    const now = Date.now();
    if (now - lastAutoAt.current < 20_000) return;

    // 1. ad break / talk (if you asked) / a song you disliked → the best song on air
    const t = buildTaste(st);
    const unwanted: SwitchEvent["kind"] | null =
      np?.kind === "ad" && st.radioPrefs.skipAds
        ? "ad"
        : np?.kind === "talk" && st.radioPrefs.skipTalk
          ? "talk"
          : isSong(np) && matchNowPlaying(np, t).score <= -100
            ? "disliked"
            : null;
    if (unwanted) {
      lastAutoAt.current = now;
      void switchChecked(candidates(), unwanted, { quiet: true });
      return;
    }

    // 2. your track / artist just started elsewhere → switch only if you turned it on
    if (!st.radioPrefs.autoSwitch || now - lastAutoAt.current < 120_000) return;
    const curTier = isSong(np) ? (matchNowPlaying(np, t).kind === "track" ? 2 : matchNowPlaying(np, t).kind === "artist" ? 1 : 0) : -1;
    const best = queueRef.current.find(
      (q) => q.station.id !== cur.id && q.tier >= 1 && q.tier > curTier && q.startedAt !== null && now - q.startedAt < 30_000,
    );
    if (best) {
      lastAutoAt.current = now;
      void switchChecked([best], best.tier >= 2 ? "track" : "artist");
    }
  }, [switchChecked, candidates]);

  const checkingRef = useRef<string | null>(null);
  checkingRef.current = checking;
  const decideRef = useRef(decide);
  decideRef.current = decide;

  /* ---------------- scanning ---------------- */

  const scanning = useRef(false);
  const scanPool = useCallback(async () => {
    if (scanning.current) return;
    const ids = [...new Set([...(stationRef.current ? [stationRef.current.id] : []), ...pool.map((s) => s.id)])];
    if (!ids.length) return;
    scanning.current = true;
    try {
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
      const res = await Promise.allSettled(chunks.map((c) => fetchNp(c)));
      const items = Object.assign({}, ...res.map((r) => (r.status === "fulfilled" ? r.value : {}))) as Record<string, NowPlaying | null>;
      ingest(items);
      const cur = stationRef.current;
      if (cur && items[cur.id] !== undefined) {
        applyMediaSession(cur, items[cur.id] ?? null);
        noteCurrent(items[cur.id] ?? null);
      }
    } finally {
      scanning.current = false;
    }
    setTimeout(() => decideRef.current(), 0);
  }, [pool, fetchNp, ingest, applyMediaSession, noteCurrent]);

  const scanRef = useRef(scanPool);
  scanRef.current = scanPool;

  // pool scan: faster when you want only just-started songs
  useEffect(() => {
    if (!pool.length) return;
    void scanRef.current();
    const id = setInterval(() => {
      // keep scanning while the app is visible or the radio is playing (background)
      if (document.visibilityState === "visible" || (audioRef.current && !audioRef.current.paused)) void scanRef.current();
    }, scanEvery(freshness));
    return () => clearInterval(id);
  }, [pool, freshness]);

  // the current station: frequent cheap check — catches ad breaks within seconds
  useEffect(() => {
    const id = setInterval(async () => {
      const cur = stationRef.current;
      const a = audioRef.current;
      if (!cur || cur.hls || !a || a.paused) return;
      try {
        const items = await fetchNp([cur.id]);
        if (stationRef.current?.id !== cur.id) return;
        ingest(items);
        const np = items[cur.id] ?? null;
        applyMediaSession(cur, np);
        noteCurrent(np);
        decideRef.current();
      } catch {
        /* offline */
      }
    }, CURRENT_POLL_MS);
    return () => clearInterval(id);
  }, [fetchNp, ingest, applyMediaSession, noteCurrent]);

  /* ---------------- suggestion (auto-switch off) ---------------- */

  const autoSwitch = useLibrary((s) => s.radioPrefs.autoSwitch);
  const suggestion = useMemo(() => {
    if (autoSwitch || !station) return null;
    const now = Date.now();
    return (
      queue.find(
        (q) => q.station.id !== station.id && q.tier >= 1 && !dismissed.has(q.key) && q.startedAt !== null && now - q.startedAt < 90_000,
      ) ?? null
    );
  }, [queue, station, autoSwitch, dismissed]);

  const value = useMemo<RadioCtx>(
    () => ({
      station,
      active,
      current: station ? (nowPlaying[station.id] ?? null) : null,
      playing,
      buffering,
      error,
      pool,
      poolLoading,
      nowPlaying,
      since,
      matches,
      ranked,
      queue,
      suggestion,
      dismissSuggestion: () => suggestion && setDismissed((d) => new Set(d).add(suggestion.key)),
      checking,
      lastSwitch,
      rewindWindow,
      behindLive,
      tune,
      playItem,
      toggle,
      stop,
      next,
      prev,
      seekBack,
      goLive,
      refresh: () => {
        void loadPool();
        void scanRef.current();
      },
    }),
    [station, active, playing, buffering, error, pool, poolLoading, nowPlaying, since, matches, ranked, queue, suggestion, checking, lastSwitch, rewindWindow, behindLive, tune, playItem, toggle, stop, next, prev, seekBack, goLive, loadPool],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="none" playsInline className="hidden" />
    </Ctx.Provider>
  );
}
