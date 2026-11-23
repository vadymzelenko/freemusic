"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type Hls from "hls.js";
import { tx } from "@/lib/i18n";
import { buildTaste, isSong, matchNowPlaying, songTrack, type Match } from "@/lib/radio/match";
import type { NowPlaying, Station } from "@/lib/radio/types";
import { fetchJSON, getJSON } from "@/lib/use-api";
import { initCloudSync } from "@/lib/cloud-sync";
import { initLibrarySync, useHydrated, useLibrary } from "@/store/library";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface SwitchEvent {
  to: Station;
  np: NowPlaying | null;
  /** why we switched: your track / artist, better match, or skipped an ad / talk */
  kind: Match["kind"] | "ad" | "talk";
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
  /** when the current song started on each station (null = was already playing when we first looked) */
  since: Record<string, number | null>;
  matches: Record<string, Match>;
  /** pool sorted by match, best first */
  ranked: Station[];
  lastSwitch: SwitchEvent | null;
  /** seconds you can go back on this station (HLS timeshift), 0 = live only */
  rewindWindow: number;
  /** how far behind live you are, seconds */
  behindLive: number;
  tune: (s: Station) => void;
  toggle: () => void;
  stop: () => void;
  step: (dir: 1 | -1) => void;
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

/* ------------------------------------------------------------------ */
/* Tuning static — a short burst of filtered noise, like a real dial   */
/* ------------------------------------------------------------------ */

let audioCtx: AudioContext | null = null;
function tuningStatic() {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    const len = Math.floor(ctx.sampleRate * 0.38);
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
    gain.gain.value = 0.09;
    src.connect(band).connect(gain).connect(ctx.destination);
    src.start();
  } catch {
    /* no WebAudio — silent tuning */
  }
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

const POLL_MS = 30_000;
/** the station you're listening to is checked more often — that's how ad breaks are caught */
const CURRENT_POLL_MS = 10_000;
const POOL_PER_TAG = 12;
const POOL_PER_COUNTRY = 12;
const MAX_POOL = 80;

export function RadioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const radioTags = useLibrary((s) => s.radioTags);
  const radioFavs = useLibrary((s) => s.radioFavs);
  const smart = useLibrary((s) => s.radioSmart);
  const countries = useLibrary((s) => s.radioPrefs.countries);
  const likedIds = useLibrary((s) => s.likedIds);
  const dislikedIds = useLibrary((s) => s.dislikedIds);
  const followed = useLibrary((s) => s.artists);

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

  const stationRef = useRef<Station | null>(null);
  const lastSwitchAt = useRef(0);
  const sinceRef = useRef<Record<string, number | null>>({});
  const rawRef = useRef<Record<string, string>>({});
  const npRef = useRef<Record<string, NowPlaying | null>>({});
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

  /* ---------------- taste & ranking ---------------- */

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

  const ranked = useMemo(() => {
    const favIds = new Set(radioFavs.map((f) => f.id));
    return [...pool].sort((a, b) => {
      const sa = (matches[a.id]?.score ?? 0) + (favIds.has(a.id) ? 5 : 0) + (nowPlaying[a.id] ? 1 : 0);
      const sb = (matches[b.id]?.score ?? 0) + (favIds.has(b.id) ? 5 : 0) + (nowPlaying[b.id] ? 1 : 0);
      return sb - sa || b.votes - a.votes;
    });
  }, [pool, matches, radioFavs, nowPlaying]);

  /* ---------------- pool: favourites + top stations of your genres ---------------- */

  const loadPool = useCallback(async () => {
    setPoolLoading(true);
    try {
      const urls = [
        ...radioTags.map((tag) => `/api/radio/search?tag=${encodeURIComponent(tag)}&limit=${POOL_PER_TAG}`),
        // music stations from your countries, in your genres where possible
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
      for (const s of [...st.radioFavs, ...st.radioHistory.slice(0, 6).map((h) => h.s), ...flat]) {
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
    navigator.mediaSession.metadata = new MediaMetadata({
      title: np?.title || s.name,
      artist: np?.artist || s.name,
      album: `${s.name} · ${tx("Радио")}`,
      artwork: s.favicon ? [{ src: s.favicon, sizes: "512x512" }] : [],
    });
  }, []);

  const tuneImpl = useCallback(
    (s: Station, opts: { quiet?: boolean } = {}) => {
      const a = audioRef.current;
      if (!a) return;
      if (!opts.quiet) tuningStatic();
      flushHeard();
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
      setTimeout(() => void pollCurrentRef.current(), 1500);
      fetch(`/api/radio/click?id=${encodeURIComponent(s.id)}`).catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attach, applyMediaSession],
  );

  const tune = useCallback((s: Station) => tuneImpl(s), [tuneImpl]);

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
  }, [attach]);

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
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!ranked.length) return;
      const cur = stationRef.current;
      const i = cur ? ranked.findIndex((s) => s.id === cur.id) : -1;
      const next = ranked[(i + dir + ranked.length) % ranked.length]!;
      tuneImpl(next);
    },
    [ranked, tuneImpl],
  );

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

  // audio element events
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onPlay = () => {
      setPlaying(true);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
      // lock-screen controls switch stations while the radio is on
      const ms = navigator.mediaSession;
      if (ms) {
        try {
          ms.setActionHandler("play", () => toggleRef.current());
          ms.setActionHandler("pause", () => toggleRef.current());
          ms.setActionHandler("nexttrack", () => stepRef.current(1));
          ms.setActionHandler("previoustrack", () => stepRef.current(-1));
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

  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  const stepRef = useRef(step);
  stepRef.current = step;

  /* ---------------- listening history (songs heard on air) ---------------- */

  function flushHeard() {
    const h = heardRef.current;
    heardRef.current = null;
    if (!h) return;
    const listened = (Date.now() - h.from) / 1000;
    // a song you sat through from the start counts as "completed"
    useLibrary.getState().recordPlay(songTrack(h.np), listened, h.startedFresh && listened > 90);
  }

  /** called whenever we learn what's on the current station */
  const noteCurrent = useCallback((id: string, np: NowPlaying | null, changed: boolean) => {
    const cur = stationRef.current;
    const a = audioRef.current;
    if (!cur || cur.id !== id || !a || a.paused) return;
    const h = heardRef.current;
    if (h && h.np.raw === np?.raw) return;
    flushHeard();
    if (isSong(np)) heardRef.current = { np, from: Date.now(), startedFresh: changed };
  }, []);

  /** an ad break / talk started on the current station → move to the best station playing music */
  const maybeSkip = useCallback(
    (np: NowPlaying | null) => {
      const st = useLibrary.getState();
      const cur = stationRef.current;
      const a = audioRef.current;
      if (!cur || !a || a.paused || !np) return;
      const bad = (np.kind === "ad" && st.radioPrefs.skipAds) || (np.kind === "talk" && st.radioPrefs.skipTalk);
      if (!bad) return;
      const now = Date.now();
      if (now - lastSwitchAt.current < 20_000) return;
      const t = buildTaste(st);
      const cands = pool
        .filter((s) => s.id !== cur.id && isSong(npRef.current[s.id]))
        .map((s) => {
          const m = matchNowPlaying(npRef.current[s.id], t);
          const started = sinceRef.current[s.id];
          const fresh = started && now - started < 90_000 ? 15 : 0;
          return { s, m, score: m.score + fresh + (st.radioFavs.some((f) => f.id === s.id) ? 10 : 0) };
        })
        .filter((c) => c.m.score > -50)
        .sort((x, y) => y.score - x.score || y.s.votes - x.s.votes);
      const best = cands[0];
      if (!best) return;
      lastSwitchAt.current = now;
      tuneImpl(best.s, { quiet: true });
      setLastSwitch({ to: best.s, np: npRef.current[best.s.id] ?? null, kind: np.kind === "ad" ? "ad" : "talk", at: now });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pool],
  );

  /* ---------------- now-playing polling ---------------- */

  const poll = useCallback(async () => {
    const ids = [...new Set([...(stationRef.current ? [stationRef.current.id] : []), ...pool.map((s) => s.id)])].slice(0, 80);
    if (!ids.length) return;
    let items: Record<string, NowPlaying | null> = {};
    try {
      items = (await fetchJSON<{ items?: Record<string, NowPlaying | null> }>(`/api/radio/nowplaying?ids=${ids.join(",")}`)).items ?? {};
    } catch {
      return;
    }
    const now = Date.now();
    const nextSince = { ...sinceRef.current };
    for (const [id, np] of Object.entries(items)) {
      const raw = np?.raw ?? "";
      const prev = rawRef.current[id];
      if (prev === undefined) nextSince[id] = null; // first look: song was already on
      else if (prev !== raw) nextSince[id] = raw ? now : null; // changed → just started
      rawRef.current[id] = raw;
    }
    sinceRef.current = nextSince;
    npRef.current = { ...npRef.current, ...items };
    setSince(nextSince);
    setNowPlaying((old) => ({ ...old, ...items }));

    const cur = stationRef.current;
    if (cur && items[cur.id] !== undefined) {
      applyMediaSession(cur, items[cur.id] ?? null);
      noteCurrent(cur.id, items[cur.id] ?? null, nextSince[cur.id] != null);
      maybeSkip(items[cur.id] ?? null);
      if (stationRef.current !== cur) return; // just skipped an ad
    }

    // ---- smart switching ----
    const st = useLibrary.getState();
    const a = audioRef.current;
    if (!st.radioSmart || !cur || !a || a.paused) return;
    if (now - lastSwitchAt.current < 75_000) return;
    const t = buildTaste(st);
    const curScore = matchNowPlaying(items[cur.id] ?? null, t).score;
    let best: { s: Station; m: Match } | null = null;
    for (const s of pool) {
      if (s.id === cur.id) continue;
      const m = matchNowPlaying(items[s.id] ?? null, t);
      const started = nextSince[s.id];
      // only jump to a song that has JUST started — you get it from the beginning
      if (m.score >= 100 && started && now - started < 70_000 && items[s.id]?.kind === "music" && (!best || m.score > best.m.score)) best = { s, m };
    }
    if (best && best.m.score > curScore) {
      lastSwitchAt.current = now;
      tuneImpl(best.s);
      setLastSwitch({ to: best.s, np: items[best.s.id] ?? null, kind: best.m.kind, at: now });
    } else if (curScore <= -100) {
      // something you dislike came on — hop to the best other station
      const alt = pool
        .filter((s) => s.id !== cur.id)
        .map((s) => ({ s, m: matchNowPlaying(items[s.id] ?? null, t) }))
        .sort((x, y) => y.m.score - x.m.score)[0];
      if (alt && alt.m.score >= 0) {
        lastSwitchAt.current = now;
        tuneImpl(alt.s);
        setLastSwitch({ to: alt.s, np: items[alt.s.id] ?? null, kind: alt.m.kind, at: now });
      }
    }
  }, [pool, applyMediaSession, tuneImpl, noteCurrent, maybeSkip]);

  const pollRef = useRef(poll);
  pollRef.current = poll;

  /** fast check of just the current station: catches ad breaks and song changes */
  const pollCurrent = useCallback(async () => {
    const cur = stationRef.current;
    const a = audioRef.current;
    if (!cur || cur.hls || !a || a.paused) return;
    let np: NowPlaying | null = null;
    try {
      np = (await fetchJSON<{ items?: Record<string, NowPlaying | null> }>(`/api/radio/nowplaying?ids=${cur.id}`)).items?.[cur.id] ?? null;
    } catch {
      return;
    }
    if (stationRef.current?.id !== cur.id) return;
    const raw = np?.raw ?? "";
    const prev = rawRef.current[cur.id];
    if (prev !== raw) {
      const nextSince = { ...sinceRef.current, [cur.id]: prev === undefined ? null : raw ? Date.now() : null };
      sinceRef.current = nextSince;
      setSince(nextSince);
      rawRef.current[cur.id] = raw;
    }
    npRef.current = { ...npRef.current, [cur.id]: np };
    setNowPlaying((old) => ({ ...old, [cur.id]: np }));
    applyMediaSession(cur, np);
    noteCurrent(cur.id, np, sinceRef.current[cur.id] != null);
    maybeSkip(np);
  }, [applyMediaSession, noteCurrent, maybeSkip]);

  const pollCurrentRef = useRef(pollCurrent);
  pollCurrentRef.current = pollCurrent;

  useEffect(() => {
    const id = setInterval(() => void pollCurrentRef.current(), CURRENT_POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pool.length) return;
    void pollRef.current();
    const id = setInterval(() => {
      // keep scanning while the app is visible or the radio is playing (background)
      if (document.visibilityState === "visible" || (audioRef.current && !audioRef.current.paused)) void pollRef.current();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [pool]);

  // smart mode is read from the store in poll(); re-render consumers on change
  void smart;

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
      lastSwitch,
      rewindWindow,
      behindLive,
      tune,
      toggle,
      stop,
      step,
      seekBack,
      goLive,
      refresh: () => {
        void loadPool();
        void pollRef.current();
      },
    }),
    [station, active, playing, buffering, error, pool, poolLoading, nowPlaying, since, matches, ranked, lastSwitch, rewindWindow, behindLive, tune, toggle, stop, step, seekBack, goLive, loadPool],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="none" playsInline className="hidden" />
    </Ctx.Provider>
  );
}
