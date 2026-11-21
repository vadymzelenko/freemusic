"use client";

import type { User } from "@supabase/supabase-js";
import { create } from "zustand";
import type { Playlist, Track } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";
import { useLibrary } from "@/store/library";

/* ------------------------------------------------------------------ */
/* Auth + sync status store                                            */
/* ------------------------------------------------------------------ */

export type SyncStatus = "off" | "syncing" | "synced" | "error";

interface AuthState {
  user: User | null;
  ready: boolean;
  status: SyncStatus;
  error: string | null;
}

export const useAuth = create<AuthState>(() => ({ user: null, ready: false, status: "off", error: null }));

export async function signInWithGoogle(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/library` },
  });
  if (error) useAuth.setState({ status: "error", error: error.message });
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await flushPush();
  await sb.auth.signOut();
}

/* ------------------------------------------------------------------ */
/* Data shape stored in Supabase                                       */
/* ------------------------------------------------------------------ */

interface LibraryData {
  tracks: Record<string, Track>;
  likedIds: string[];
  playlists: Playlist[];
  searchHistory: string[];
  lastQueue: { tracks: Track[]; index: number; radio: boolean };
}

function snapshot(): LibraryData {
  const s = useLibrary.getState();
  // Only keep track metadata that something references — keeps the row small.
  const used = new Set<string>([...s.likedIds, ...s.playlists.flatMap((p) => p.trackIds)]);
  const tracks: Record<string, Track> = {};
  for (const id of used) {
    const t = s.tracks[id];
    if (t) tracks[id] = t;
  }
  return {
    tracks,
    likedIds: s.likedIds,
    playlists: s.playlists,
    searchHistory: s.searchHistory,
    lastQueue: s.lastQueue,
  };
}

function normalize(raw: unknown): LibraryData {
  const d = (raw ?? {}) as Partial<LibraryData>;
  return {
    tracks: d.tracks && typeof d.tracks === "object" ? d.tracks : {},
    likedIds: Array.isArray(d.likedIds) ? d.likedIds : [],
    playlists: Array.isArray(d.playlists) ? d.playlists : [],
    searchHistory: Array.isArray(d.searchHistory) ? d.searchHistory : [],
    lastQueue:
      d.lastQueue && Array.isArray(d.lastQueue.tracks)
        ? d.lastQueue
        : { tracks: [], index: 0, radio: true },
  };
}

/** First login on a device: union local (anonymous) data with the cloud copy. */
function merge(local: LibraryData, remote: LibraryData): LibraryData {
  const liked = [...remote.likedIds, ...local.likedIds.filter((id) => !remote.likedIds.includes(id))];
  const byId = new Map<string, Playlist>();
  for (const p of remote.playlists) byId.set(p.id, p);
  for (const p of local.playlists) {
    const r = byId.get(p.id);
    byId.set(
      p.id,
      r ? { ...r, trackIds: [...r.trackIds, ...p.trackIds.filter((x) => !r.trackIds.includes(x))] } : p,
    );
  }
  const history = [...local.searchHistory, ...remote.searchHistory]
    .filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i)
    .slice(0, 15);
  return {
    tracks: { ...remote.tracks, ...local.tracks },
    likedIds: liked,
    playlists: [...byId.values()].sort((a, b) => b.createdAt - a.createdAt),
    searchHistory: history,
    lastQueue: local.lastQueue.tracks.length ? local.lastQueue : remote.lastQueue,
  };
}

/* ------------------------------------------------------------------ */
/* Push / pull                                                         */
/* ------------------------------------------------------------------ */

let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastSyncedAt = 0; // remote updated_at (ms) we are in sync with
let dirty = false;

function applyLocal(data: LibraryData) {
  applyingRemote = true;
  useLibrary.setState((s) => ({
    tracks: { ...s.tracks, ...data.tracks },
    likedIds: data.likedIds,
    playlists: data.playlists,
    searchHistory: data.searchHistory,
    lastQueue: data.lastQueue,
  }));
  applyingRemote = false;
}

async function push(): Promise<void> {
  const sb = getSupabase();
  const user = useAuth.getState().user;
  if (!sb || !user) return;
  dirty = false;
  useAuth.setState({ status: "syncing" });
  const updated_at = new Date().toISOString();
  const { error } = await sb
    .from("user_library")
    .upsert({ user_id: user.id, data: snapshot(), updated_at }, { onConflict: "user_id" });
  if (error) {
    dirty = true;
    useAuth.setState({ status: "error", error: error.message });
    return;
  }
  lastSyncedAt = Date.parse(updated_at);
  useAuth.setState({ status: "synced", error: null });
}

function schedulePush() {
  dirty = true;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void push();
  }, 1500);
}

async function flushPush(): Promise<void> {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  if (dirty) await push();
}

async function fetchRemote(userId: string): Promise<{ data: LibraryData; updatedAt: number } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("user_library")
    .select("data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { data: normalize(data.data), updatedAt: Date.parse(data.updated_at as string) };
}

/** Called right after sign-in: merge local + cloud, then push the result. */
async function initialSync(user: User) {
  useAuth.setState({ status: "syncing" });
  try {
    const remote = await fetchRemote(user.id);
    if (remote) applyLocal(merge(snapshot(), remote.data));
    await push();
  } catch (e) {
    useAuth.setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

/** When the app comes back to foreground: take newer changes made on another device. */
async function pullIfNewer() {
  const user = useAuth.getState().user;
  if (!user) return;
  await flushPush();
  try {
    const remote = await fetchRemote(user.id);
    if (remote && remote.updatedAt > lastSyncedAt) {
      applyLocal(remote.data);
      lastSyncedAt = remote.updatedAt;
      useAuth.setState({ status: "synced", error: null });
    }
  } catch {
    /* offline — ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Bootstrap (called once from PlayerProvider)                          */
/* ------------------------------------------------------------------ */

export function initCloudSync(): () => void {
  const sb = getSupabase();
  if (!sb) {
    useAuth.setState({ ready: true, status: "off" });
    return () => {};
  }

  let currentUserId: string | null = null;

  const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;
    useAuth.setState({ user, ready: true, status: user ? useAuth.getState().status : "off" });
    if (user && user.id !== currentUserId) {
      currentUserId = user.id;
      lastSyncedAt = 0;
      // defer: Supabase recommends not awaiting other calls inside this callback
      setTimeout(() => {
        const start = () => void initialSync(user);
        if (useLibrary.persist.hasHydrated()) start();
        else useLibrary.persist.onFinishHydration(start);
      }, 0);
    }
    if (!user) currentUserId = null;
  });

  const unsubStore = useLibrary.subscribe((state, prev) => {
    if (applyingRemote || !useAuth.getState().user) return;
    if (
      state.likedIds !== prev.likedIds ||
      state.playlists !== prev.playlists ||
      state.searchHistory !== prev.searchHistory ||
      state.lastQueue !== prev.lastQueue
    ) {
      schedulePush();
    }
  });

  const onVisible = () => {
    if (document.visibilityState === "visible") void pullIfNewer();
    else void flushPush(); // app goes to background — save immediately
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    sub.subscription.unsubscribe();
    unsubStore();
    document.removeEventListener("visibilitychange", onVisible);
  };
}
