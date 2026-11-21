"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { apiUrl, prepareUrl, streamUrl } from "@/lib/format";
import type { Track } from "@/lib/types";
import { initCloudSync } from "@/lib/cloud-sync";
import { offlineUrl, reconcileDownloads } from "@/lib/downloads";
import { buildProfile, filterRadio } from "@/lib/recommend";
import { isDownloaded } from "@/store/downloads";
import { initLibrarySync, useHydrated, useLibrary } from "@/store/library";

/* ------------------------------------------------------------------ */
/* Progress store — high-frequency updates live outside React state    */
/* ------------------------------------------------------------------ */

export interface Progress {
  time: number;
  duration: number;
  buffered: number;
}

function createProgressStore() {
  let snapshot: Progress = { time: 0, duration: 0, buffered: 0 };
  const listeners = new Set<() => void>();
  return {
    get: () => snapshot,
    set(next: Progress) {
      if (
        next.time === snapshot.time &&
        next.duration === snapshot.duration &&
        next.buffered === snapshot.buffered
      )
        return;
      snapshot = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

const SERVER_PROGRESS: Progress = { time: 0, duration: 0, buffered: 0 };

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

interface PlayerContextValue {
  queue: Track[];
  index: number;
  current: Track | null;
  isPlaying: boolean;
  isBuffering: boolean;
  radio: boolean;
  radioLoading: boolean;
  /** Last playback error shown to the user (cleared on next track). */
  error: string | null;
  playerOpen: boolean;
  setPlayerOpen: (open: boolean) => void;

  playTracks: (tracks: Track[], startIndex?: number) => void;
  playTrack: (track: Track) => void;
  jumpTo: (index: number) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  playNext: (track: Track) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearUpcoming: () => void;
  setRadio: (on: boolean) => void;

  progressStore: ReturnType<typeof createProgressStore>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}

export function useProgress(): Progress {
  const { progressStore } = usePlayer();
  return useSyncExternalStore(progressStore.subscribe, progressStore.get, () => SERVER_PROGRESS);
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

const PREWARM_BEFORE_END_S = 20;

/**
 * Real track length. Safari sometimes reports ~2x the duration for YouTube AAC files
 * (SBR / HE-AAC), leaving silence at the end — trust the catalog duration in that case.
 */
function effectiveDuration(a: HTMLAudioElement, t: Track | undefined): number {
  const d = a.duration;
  const meta = t?.duration ?? 0;
  if (Number.isFinite(d) && d > 0) {
    if (meta > 0 && d > meta * 1.25 + 5) return meta;
    return d;
  }
  return meta;
}

type Actions = { play: () => void; pause: () => void; next: () => void; prev: () => void; seek: (s: number) => void };

/** (Re)installs lock-screen controls. iOS can drop them when the source changes, so this runs on every play. */
function applyMediaHandlers(actions: { current: Actions }) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  const set = (action: MediaSessionAction, h: MediaSessionActionHandler | null) => {
    try {
      ms.setActionHandler(action, h);
    } catch {
      /* unsupported action */
    }
  };
  // Explicitly remove ±10s skip buttons so iOS shows previous / next track instead.
  set("seekbackward", null);
  set("seekforward", null);
  set("play", () => actions.current.play());
  set("pause", () => actions.current.pause());
  set("previoustrack", () => actions.current.prev());
  set("nexttrack", () => actions.current.next());
  set("seekto", (d) => {
    if (typeof d.seekTime === "number") actions.current.seek(d.seekTime);
  });
}
const RADIO_REFILL_THRESHOLD = 3;
const MAX_CONSECUTIVE_FAILURES = 2;

export function PlayerProvider({ children }: { children: ReactNode }) {
  // The ONE audio element for the whole app lifetime. Never re-created, never keyed.
  const audioRef = useRef<HTMLAudioElement>(null);

  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [radio, setRadioState] = useState(true);
  const [radioLoading, setRadioLoading] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs mirror state so audio event handlers can act synchronously (no stale closures, no awaits).
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(0);
  const radioRef = useRef(true);
  const prewarmedRef = useRef<Set<string>>(new Set());
  const retriedRef = useRef<Set<string>>(new Set());
  const failuresRef = useRef(0);
  const playRecordedRef = useRef(false);
  const fakeEndedRef = useRef(false);
  const radioSeedRef = useRef<string | null>(null);
  const loadedIdRef = useRef<string | null>(null);
  const lastPositionUpdateRef = useRef(0);

  const progressStore = useMemo(() => createProgressStore(), []);

  const hydrated = useHydrated();
  const saveQueue = useLibrary((s) => s.saveQueue);
  const remember = useLibrary((s) => s.remember);
  const recordPlay = useLibrary((s) => s.recordPlay);

  /* ---------------- queue mutation helpers ---------------- */

  const commitQueue = useCallback((next: Track[]) => {
    queueRef.current = next;
    setQueue(next);
  }, []);

  const commitIndex = useCallback((i: number) => {
    indexRef.current = i;
    setIndex(i);
  }, []);

  /* ---------------- Media Session ---------------- */

  const updateMediaMetadata = useCallback((t: Track) => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      album: t.album ?? "",
      artwork: [
        { src: t.cover, sizes: "544x544", type: "image/jpeg" },
        { src: t.cover, sizes: "512x512", type: "image/jpeg" },
      ],
    });
  }, []);

  const updatePositionState = useCallback(() => {
    const a = audioRef.current;
    if (!a || !("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    const duration = effectiveDuration(a, queueRef.current[indexRef.current]);
    if (!Number.isFinite(duration) || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: a.playbackRate || 1,
        position: Math.min(Math.max(a.currentTime, 0), duration),
      });
    } catch {
      /* some browsers throw on edge values */
    }
  }, []);

  /* ---------------- radio (infinite autoplay) ---------------- */

  const refillRadio = useCallback(
    async (force = false): Promise<boolean> => {
      const q = queueRef.current;
      const i = indexRef.current;
      const seed = q[i];
      if (!seed || (!radioRef.current && !force)) return false;
      if (!force && q.length - 1 - i >= RADIO_REFILL_THRESHOLD) return false;
      if (radioSeedRef.current === seed.id) return false;
      radioSeedRef.current = seed.id;
      setRadioLoading(true);
      try {
        const res = await fetch(apiUrl(`/api/related?id=${encodeURIComponent(seed.id)}`));
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { tracks?: Track[] };
        const existing = new Set(queueRef.current.map((t) => t.id));
        const fresh = filterRadio(
          (data.tracks ?? []).filter((t) => !existing.has(t.id)),
          buildProfile(useLibrary.getState()),
        );
        if (!fresh.length) return false;
        commitQueue([...queueRef.current, ...fresh]);
        return true;
      } catch {
        radioSeedRef.current = null; // allow retry later
        return false;
      } finally {
        setRadioLoading(false);
      }
    },
    [commitQueue],
  );

  /* ---------------- core: synchronous track switch ---------------- */

  /**
   * Switches to queue[i] SYNCHRONOUSLY: only `audio.src` changes, then `play()`.
   * No awaits/fetches before play() — required for iOS background playback.
   */
  const loadIndex = useCallback(
    (i: number, autoplay: boolean) => {
      const a = audioRef.current;
      const t = queueRef.current[i];
      if (!a || !t) return;
      const prevTrack = loadedIdRef.current ? queueRef.current.find((x) => x.id === loadedIdRef.current) : undefined;
      const prevListened = a.currentTime || 0;
      const prevCompleted = a.ended || fakeEndedRef.current;
      commitIndex(i);
      setError(null);
      retriedRef.current.delete(t.id);
      loadedIdRef.current = t.id;
      // Downloaded tracks come from Cache Storage via the service worker; the check is synchronous.
      a.src = isDownloaded(t.id) ? offlineUrl(t.id) : streamUrl(t.id);
      if (autoplay) {
        const p = a.play();
        if (p) p.catch(() => setIsPlaying(false));
      }
      updateMediaMetadata(t);
      progressStore.set({ time: 0, duration: t.duration, buffered: 0 });
      // async work happens AFTER play() was issued
      if (prevTrack && !playRecordedRef.current) recordPlay(prevTrack, prevListened, prevCompleted);
      playRecordedRef.current = false;
      fakeEndedRef.current = false;
      void refillRadio();
    },
    [commitIndex, progressStore, recordPlay, refillRadio, updateMediaMetadata],
  );

  /* ---------------- public actions ---------------- */

  const playTracks = useCallback(
    (tracks: Track[], startIndex = 0) => {
      if (!tracks.length) return;
      remember(tracks);
      radioSeedRef.current = null;
      commitQueue(tracks);
      loadIndex(Math.min(Math.max(startIndex, 0), tracks.length - 1), true);
    },
    [commitQueue, loadIndex, remember],
  );

  const playTrack = useCallback((t: Track) => playTracks([t], 0), [playTracks]);

  const jumpTo = useCallback((i: number) => loadIndex(i, true), [loadIndex]);

  const play = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const t = queueRef.current[indexRef.current];
    if (!t) return;
    if (loadedIdRef.current !== t.id) {
      loadIndex(indexRef.current, true);
      return;
    }
    a.play().catch(() => setIsPlaying(false));
  }, [loadIndex]);

  const pause = useCallback(() => audioRef.current?.pause(), []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused || loadedIdRef.current === null) play();
    else pause();
  }, [pause, play]);

  const next = useCallback(() => {
    const i = indexRef.current + 1;
    if (i < queueRef.current.length) {
      loadIndex(i, true);
      return;
    }
    if (radioRef.current) {
      void refillRadio(true).then((ok) => ok && loadIndex(indexRef.current + 1, true));
    }
  }, [loadIndex, refillRadio]);

  const prev = useCallback(() => {
    const a = audioRef.current;
    if (a && a.currentTime > 3) {
      a.currentTime = 0;
      return;
    }
    const i = indexRef.current - 1;
    if (i >= 0) loadIndex(i, true);
    else if (a) a.currentTime = 0;
  }, [loadIndex]);

  const seek = useCallback(
    (seconds: number) => {
      const a = audioRef.current;
      if (!a || !Number.isFinite(seconds)) return;
      const d = effectiveDuration(a, queueRef.current[indexRef.current]) || seconds;
      a.currentTime = Math.min(Math.max(seconds, 0), Math.max(0, d - 0.25));
      progressStore.set({ ...progressStore.get(), time: a.currentTime });
      updatePositionState();
    },
    [progressStore, updatePositionState],
  );

  const playNext = useCallback(
    (t: Track) => {
      remember(t);
      const cur = queueRef.current[indexRef.current];
      if (!cur) {
        playTracks([t]);
        return;
      }
      if (cur.id === t.id) return;
      const rest = queueRef.current.filter((x) => x.id !== t.id);
      const at = rest.indexOf(cur);
      commitQueue([...rest.slice(0, at + 1), t, ...rest.slice(at + 1)]);
      commitIndex(at);
    },
    [commitIndex, commitQueue, playTracks, remember],
  );

  const addToQueue = useCallback(
    (t: Track) => {
      remember(t);
      if (!queueRef.current.length) {
        playTracks([t]);
        return;
      }
      if (queueRef.current.some((x) => x.id === t.id)) return;
      commitQueue([...queueRef.current, t]);
    },
    [commitQueue, playTracks, remember],
  );

  const removeFromQueue = useCallback(
    (i: number) => {
      if (i === indexRef.current) return; // can't remove the playing track
      const nextQ = queueRef.current.filter((_, k) => k !== i);
      commitQueue(nextQ);
      if (i < indexRef.current) commitIndex(indexRef.current - 1);
    },
    [commitIndex, commitQueue],
  );

  const clearUpcoming = useCallback(() => {
    commitQueue(queueRef.current.slice(0, indexRef.current + 1));
    radioSeedRef.current = null;
  }, [commitQueue]);

  const setRadio = useCallback(
    (on: boolean) => {
      radioRef.current = on;
      setRadioState(on);
      if (on) {
        radioSeedRef.current = null;
        void refillRadio();
      }
    },
    [refillRadio],
  );

  /* ---------------- audio element events (bound once) ---------------- */

  // Keep the latest callbacks in a ref so the listeners are attached exactly once.
  const handlersRef = useRef({ loadIndex, refillRadio, updatePositionState });
  handlersRef.current = { loadIndex, refillRadio, updatePositionState };

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const readProgress = () => {
      let buffered = 0;
      try {
        if (a.buffered.length) buffered = a.buffered.end(a.buffered.length - 1);
      } catch {
        /* ignore */
      }
      const d = effectiveDuration(a, queueRef.current[indexRef.current]);
      progressStore.set({
        time: Math.min(a.currentTime, d || a.currentTime),
        duration: d,
        buffered: Math.min(buffered, d || buffered),
      });
    };

    const onTimeUpdate = () => {
      readProgress();
      const now = performance.now();
      if (now - lastPositionUpdateRef.current > 1000) {
        lastPositionUpdateRef.current = now;
        handlersRef.current.updatePositionState();
      }
      const d = effectiveDuration(a, queueRef.current[indexRef.current]);
      // Inflated duration (see effectiveDuration): the music is over, skip the trailing silence.
      if (d > 0 && Number.isFinite(a.duration) && a.duration - d > 5 && a.currentTime >= d + 0.3 && !fakeEndedRef.current) {
        fakeEndedRef.current = true;
        onEnded();
        return;
      }
      // Pre-warm the next track ~20s before the end.
      if (d > 0 && d - a.currentTime <= PREWARM_BEFORE_END_S) {
        const nextTrack = queueRef.current[indexRef.current + 1];
        if (nextTrack && !prewarmedRef.current.has(nextTrack.id)) {
          prewarmedRef.current.add(nextTrack.id);
          fetch(prepareUrl(nextTrack.id), { keepalive: true }).catch(() => {
            prewarmedRef.current.delete(nextTrack.id);
          });
        }
      }
    };

    // SYNCHRONOUS track switch — no async code before audio.src/play().
    const onEnded = () => {
      const i = indexRef.current + 1;
      if (i < queueRef.current.length) {
        handlersRef.current.loadIndex(i, true);
        return;
      }
      setIsPlaying(false);
      const done = queueRef.current[indexRef.current];
      if (done && !playRecordedRef.current) {
        playRecordedRef.current = true;
        useLibrary.getState().recordPlay(done, a.currentTime || done.duration, true);
      }
      // Fallback (radio refill didn't land in time).
      if (radioRef.current) {
        void handlersRef.current
          .refillRadio(true)
          .then((ok) => ok && handlersRef.current.loadIndex(indexRef.current + 1, true));
      }
    };

    const onPlay = () => {
      setIsPlaying(true);
      applyMediaHandlers(actionsRef);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    };
    const onPause = () => {
      setIsPlaying(false);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    };
    const onWaiting = () => setIsBuffering(true);
    const onReady = () => setIsBuffering(false);
    const onLoadStart = () => setIsBuffering(true);
    const onMeta = () => {
      readProgress();
      handlersRef.current.updatePositionState();
    };

    const onError = () => {
      const t = queueRef.current[indexRef.current];
      if (!t || !a.src) return;
      if (!retriedRef.current.has(t.id)) {
        // One retry with a freshly-resolved upstream URL.
        retriedRef.current.add(t.id);
        a.src = `${streamUrl(t.id)}&fresh=1`;
        a.play().catch(() => setIsPlaying(false));
        return;
      }
      setIsBuffering(false);
      failuresRef.current += 1;
      // Several tracks in a row failed — the backend is broken, don't burn through the queue.
      const nextIndex = indexRef.current + 1;
      if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES || nextIndex >= queueRef.current.length) {
        failuresRef.current = 0;
        a.pause();
        setIsPlaying(false);
        setError("Не удалось загрузить аудио");
        fetch(prepareUrl(t.id))
          .then((r) => r.json() as Promise<{ error?: string }>)
          .then((d) => d.error && setError(`Не удалось загрузить аудио: ${d.error}`))
          .catch(() => {});
        return;
      }
      // Skip broken track.
      handlersRef.current.loadIndex(nextIndex, true);
    };

    const onPlaying = () => {
      failuresRef.current = 0;
      setIsBuffering(false);
    };

    a.addEventListener("timeupdate", onTimeUpdate);
    a.addEventListener("ended", onEnded);
    a.addEventListener("play", onPlay);
    a.addEventListener("playing", onPlaying);
    a.addEventListener("pause", onPause);
    a.addEventListener("waiting", onWaiting);
    a.addEventListener("loadstart", onLoadStart);
    a.addEventListener("canplay", onReady);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("progress", readProgress);
    a.addEventListener("seeked", onMeta);
    a.addEventListener("error", onError);
    return () => {
      a.removeEventListener("timeupdate", onTimeUpdate);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("playing", onPlaying);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("waiting", onWaiting);
      a.removeEventListener("loadstart", onLoadStart);
      a.removeEventListener("canplay", onReady);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("progress", readProgress);
      a.removeEventListener("seeked", onMeta);
      a.removeEventListener("error", onError);
    };
  }, [progressStore]);

  /* ---------------- Media Session action handlers ---------------- */

  const actionsRef = useRef<Actions>({ play, pause, next, prev, seek });
  actionsRef.current = { play, pause, next, prev, seek };

  useEffect(() => {
    applyMediaHandlers(actionsRef);
  }, []);

  /* ---------------- persistence ---------------- */

  useEffect(() => {
    // Wake the serverless function + YouTube session in the background on launch.
    fetch(apiUrl("/api/warm")).catch(() => {});
    const stopLocal = initLibrarySync();
    void reconcileDownloads();
    const stopCloud = initCloudSync();
    return () => {
      stopLocal();
      stopCloud();
    };
  }, []);

  const restoredRef = useRef(false);
  useEffect(() => {
    if (!hydrated || restoredRef.current) return;
    restoredRef.current = true;
    const { lastQueue } = useLibrary.getState();
    if (lastQueue.tracks.length && !queueRef.current.length) {
      commitQueue(lastQueue.tracks);
      const i = Math.min(lastQueue.index, lastQueue.tracks.length - 1);
      commitIndex(i);
      radioRef.current = lastQueue.radio;
      setRadioState(lastQueue.radio);
      const t = lastQueue.tracks[i];
      if (t) {
        // Resolve the stream URL before the user taps play (cold start happens now, not on tap).
        fetch(prepareUrl(t.id)).catch(() => {});
        updateMediaMetadata(t);
        progressStore.set({ time: 0, duration: t.duration, buffered: 0 });
      }
    }
  }, [hydrated, commitIndex, commitQueue, progressStore, updateMediaMetadata]);

  useEffect(() => {
    if (!restoredRef.current) return;
    const id = setTimeout(() => saveQueue(queue, index, radio), 400);
    return () => clearTimeout(id);
  }, [queue, index, radio, saveQueue]);

  /* ---------------- value ---------------- */

  const current = queue[index] ?? null;

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      index,
      current,
      isPlaying,
      isBuffering,
      radio,
      radioLoading,
      error,
      playerOpen,
      setPlayerOpen,
      playTracks,
      playTrack,
      jumpTo,
      toggle,
      play,
      pause,
      next,
      prev,
      seek,
      playNext,
      addToQueue,
      removeFromQueue,
      clearUpcoming,
      setRadio,
      progressStore,
    }),
    [
      queue,
      index,
      current,
      isPlaying,
      isBuffering,
      radio,
      radioLoading,
      error,
      playerOpen,
      playTracks,
      playTrack,
      jumpTo,
      toggle,
      play,
      pause,
      next,
      prev,
      seek,
      playNext,
      addToQueue,
      removeFromQueue,
      clearUpcoming,
      setRadio,
      progressStore,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/* Single, permanent audio element. Only `src` ever changes. */}
      <audio ref={audioRef} preload="auto" playsInline x-webkit-airplay="allow" className="hidden" />
    </PlayerContext.Provider>
  );
}
