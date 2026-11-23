"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type Hls from "hls.js";
import { usePlayer } from "@/components/player/PlayerProvider";
import { tx } from "@/lib/i18n";
import { buildTaste, matchNowPlaying, type Match } from "@/lib/radio/match";
import type { NowPlaying, Station } from "@/lib/radio/types";
import { fetchJSON, getJSON } from "@/lib/use-api";
import { useLibrary } from "@/store/library";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface SwitchEvent {
  to: Station;
  np: NowPlaying | null;
  kind: Match["kind"];
  at: number;
}

interface RadioCtx {
  station: Station | null;
  /** radio is the current audio source (shows the radio bar instead of the music mini player) */
  active: boolean;
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
const POOL_PER_TAG = 16;
const MAX_POOL = 70;

export function RadioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const player = usePlayer();

  const radioTags = useLibrary((s) => s.radioTags);
  const radioFavs = useLibrary((s) => s.radioFavs);
  const smart = useLibrary((s) => s.radioSmart);
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
      const lists = await Promise.allSettled(
        radioTags.map((tag) =>
          getJSON<{ stations: Station[] }>(`/api/radio/search?tag=${encodeURIComponent(tag)}&limit=${POOL_PER_TAG}`),
        ),
      );
      const seen = new Set<string>();
      const out: Station[] = [];
      for (const s of [...useLibrary.getState().radioFavs, ...lists.flatMap((l) => (l.status === "fulfilled" ? l.value.stations : []))]) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        out.push(s);
      }
      setPool(out.slice(0, MAX_POOL));
    } finally {
      setPoolLoading(false);
    }
  }, [radioTags]);

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
      player.pause(); // music and radio never play together
      stationRef.current = s;
      setStation(s);
      setActive(true);
      setError(null);
      setBuffering(true);
      void attach(s).then(() => {
        a.play().catch(() => setPlaying(false));
      });
      applyMediaSession(s, nowPlaying[s.id] ?? null);
      fetch(`/api/radio/click?id=${encodeURIComponent(s.id)}`).catch(() => {});
    },
    [attach, applyMediaSession, nowPlaying, player],
  );

  const tune = useCallback((s: Station) => tuneImpl(s), [tuneImpl]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    const s = stationRef.current;
    if (!a || !s) return;
    if (a.paused) {
      player.pause();
      setActive(true);
      // live radio: resume at the live edge unless the station lets us sit in the past
      if (!hlsRef.current && !a.seekable.length) void attach(s).then(() => a.play().catch(() => {}));
      else a.play().catch(() => {});
    } else a.pause();
  }, [attach, player]);

  const stop = useCallback(() => {
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

  // music started → radio steps aside
  useEffect(() => {
    if (player.isPlaying && audioRef.current && !audioRef.current.paused) audioRef.current.pause();
    if (player.isPlaying) setActive(false);
  }, [player.isPlaying]);

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
    setSince(nextSince);
    setNowPlaying((old) => ({ ...old, ...items }));

    const cur = stationRef.current;
    if (cur && items[cur.id] !== undefined) applyMediaSession(cur, items[cur.id] ?? null);

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
      if (m.score >= 100 && started && now - started < 70_000 && (!best || m.score > best.m.score)) best = { s, m };
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
  }, [pool, applyMediaSession, tuneImpl]);

  const pollRef = useRef(poll);
  pollRef.current = poll;

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
