"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { create } from "zustand";
import type { FollowedArtist, PlayEvent, Playlist, Track } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";
import { tx } from "@/lib/i18n";
import { isNative } from "@/lib/native/platform";
import { EMPTY_LIBRARY, MAX_PLAYS, useLibrary, type LibraryData } from "@/store/library";

/*
 * Local-first sync.
 *  - The zustand store (localStorage) is what the UI reads.
 *  - Every change marks entities "dirty"; dirty entities are flushed to their Supabase tables
 *    ~1.5s later (or immediately when the app goes to background).
 *  - On sign-in: cloud + device are merged (union), then everything is pushed.
 *  - When the app returns to foreground: cloud state replaces local (if nothing is pending).
 */

/* ------------------------------------------------------------------ */
/* Auth + status store                                                 */
/* ------------------------------------------------------------------ */

export type SyncStatus = "off" | "syncing" | "synced" | "error";

interface AuthState {
  user: User | null;
  ready: boolean;
  /** true once the first cloud pull after sign-in finished (or there is no account) */
  loaded: boolean;
  status: SyncStatus;
  error: string | null;
}

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/could not find the table|schema cache|does not exist/i.test(msg)) {
    return tx("В Supabase нет таблиц новой версии — выполните supabase/schema.sql в SQL Editor");
  }
  return msg;
}

export const useAuth = create<AuthState>(() => ({ user: null, ready: false, loaded: false, status: "off", error: null }));

/** Deep link the native app is opened with after Google sign-in (registered in AndroidManifest / Info.plist). */
export const NATIVE_AUTH_REDIRECT = "com.vzmusic.app://auth-callback";

export async function signInWithGoogle(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  if (isNative()) {
    // Google forbids sign-in inside WebViews → use the system browser, come back via the deep link.
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: NATIVE_AUTH_REDIRECT, skipBrowserRedirect: true },
    });
    if (error || !data.url) {
      useAuth.setState({ status: "error", error: error?.message ?? "OAuth" });
      return;
    }
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: data.url, presentationStyle: "popover" });
    return;
  }
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/library` },
  });
  if (error) useAuth.setState({ status: "error", error: error.message });
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await flush();
  await sb.auth.signOut();
}

/* ------------------------------------------------------------------ */
/* Dirty tracking                                                      */
/* ------------------------------------------------------------------ */

const DIRTY_KEY = "freemusic-sync-dirty";

interface Dirty {
  reactions: Set<string>; // track ids
  playlists: Set<string>; // playlist ids
  artists: Set<string>; // artist keys
  state: boolean;
  plays: PlayEvent[];
}

const dirty: Dirty = { reactions: new Set(), playlists: new Set(), artists: new Set(), state: false, plays: [] };

function saveDirty() {
  try {
    localStorage.setItem(
      DIRTY_KEY,
      JSON.stringify({
        reactions: [...dirty.reactions],
        playlists: [...dirty.playlists],
        artists: [...dirty.artists],
        state: dirty.state,
        plays: dirty.plays.slice(-500),
      }),
    );
  } catch {
    /* storage full / private mode */
  }
}

function loadDirty() {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    if (!raw) return;
    const d = JSON.parse(raw) as { reactions?: string[]; playlists?: string[]; artists?: string[]; state?: boolean; plays?: PlayEvent[] };
    d.reactions?.forEach((x) => dirty.reactions.add(x));
    d.playlists?.forEach((x) => dirty.playlists.add(x));
    d.artists?.forEach((x) => dirty.artists.add(x));
    dirty.state ||= !!d.state;
    if (d.plays?.length) dirty.plays.push(...d.plays);
  } catch {
    /* ignore */
  }
}

const hasDirty = () =>
  dirty.reactions.size > 0 || dirty.playlists.size > 0 || dirty.artists.size > 0 || dirty.state || dirty.plays.length > 0;

function markAll(s: LibraryData) {
  s.likedIds.forEach((id) => dirty.reactions.add(id));
  s.dislikedIds.forEach((id) => dirty.reactions.add(id));
  s.playlists.forEach((p) => dirty.playlists.add(p.id));
  s.artists.forEach((a) => dirty.artists.add(a.key));
  dirty.state = true;
}

/** Diff two store snapshots and mark what changed. */
function diff(next: LibraryData, prev: LibraryData) {
  if (next.likedIds !== prev.likedIds || next.dislikedIds !== prev.dislikedIds) {
    const a = new Set([...prev.likedIds, ...prev.dislikedIds, ...next.likedIds, ...next.dislikedIds]);
    for (const id of a) {
      const before = prev.likedIds.includes(id) ? 1 : prev.dislikedIds.includes(id) ? -1 : 0;
      const after = next.likedIds.includes(id) ? 1 : next.dislikedIds.includes(id) ? -1 : 0;
      if (before !== after) dirty.reactions.add(id);
    }
  }
  if (next.playlists !== prev.playlists) {
    const byId = new Map(prev.playlists.map((p) => [p.id, p]));
    for (const p of next.playlists) if (byId.get(p.id) !== p) dirty.playlists.add(p.id);
    for (const p of prev.playlists) if (!next.playlists.some((x) => x.id === p.id)) dirty.playlists.add(p.id);
  }
  if (next.artists !== prev.artists) {
    const byKey = new Map(prev.artists.map((a) => [a.key, a]));
    for (const a of next.artists) if (byKey.get(a.key) !== a) dirty.artists.add(a.key);
    for (const a of prev.artists) if (!next.artists.some((x) => x.key === a.key)) dirty.artists.add(a.key);
  }
  if (next.plays !== prev.plays && next.plays.length) {
    const lastPrev = prev.plays[prev.plays.length - 1]?.at ?? 0;
    dirty.plays.push(...next.plays.filter((p) => p.at > lastPrev));
    if (dirty.plays.length > 1000) dirty.plays.splice(0, dirty.plays.length - 1000);
  }
  if (
    next.lastQueue !== prev.lastQueue ||
    next.searchHistory !== prev.searchHistory ||
    next.onboarded !== prev.onboarded ||
    next.hiddenSections !== prev.hiddenSections ||
    next.theme !== prev.theme ||
    next.lang !== prev.lang
  ) {
    dirty.state = true;
  }
}

/* ------------------------------------------------------------------ */
/* Row mapping                                                         */
/* ------------------------------------------------------------------ */

type TrackRow = {
  id: string;
  title: string;
  artist: string;
  artist_id: string | null;
  album: string | null;
  album_id: string | null;
  duration: number;
  cover: string;
};

const toTrackRow = (t: Track): TrackRow => ({
  id: t.id,
  title: t.title,
  artist: t.artist,
  artist_id: t.artistId ?? null,
  album: t.album ?? null,
  album_id: t.albumId ?? null,
  duration: Math.round(t.duration || 0),
  cover: t.cover || "",
});

const fromTrackRow = (r: TrackRow): Track => ({
  id: r.id,
  title: r.title,
  artist: r.artist,
  artistId: r.artist_id ?? undefined,
  album: r.album ?? undefined,
  albumId: r.album_id ?? undefined,
  duration: r.duration,
  cover: r.cover,
});

/* ------------------------------------------------------------------ */
/* Push                                                                */
/* ------------------------------------------------------------------ */

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;
let lastPullAt = 0;

function check<T extends { error: { message: string } | null }>(r: T): T {
  if (r.error) throw new Error(r.error.message);
  return r;
}

async function pushDirty(sb: SupabaseClient, user: User) {
  const s = useLibrary.getState();
  const uid = user.id;

  // Take a snapshot of what is dirty and clear it; on failure we re-add.
  const reactions = [...dirty.reactions];
  const playlists = [...dirty.playlists];
  const artists = [...dirty.artists];
  const state = dirty.state;
  const plays = dirty.plays.splice(0);
  dirty.reactions.clear();
  dirty.playlists.clear();
  dirty.artists.clear();
  dirty.state = false;

  try {
    // 1. catalog rows for every track we are about to reference
    const needed = new Set<string>();
    for (const id of reactions) if (s.likedIds.includes(id) || s.dislikedIds.includes(id)) needed.add(id);
    for (const pid of playlists) s.playlists.find((p) => p.id === pid)?.trackIds.forEach((id) => needed.add(id));
    const trackRows = [...needed].map((id) => s.tracks[id]).filter((t): t is Track => !!t).map(toTrackRow);
    for (let i = 0; i < trackRows.length; i += 500) {
      check(await sb.from("tracks").upsert(trackRows.slice(i, i + 500), { onConflict: "id" }));
    }

    // 2. likes / dislikes
    const reactionOf = (id: string) => (s.likedIds.includes(id) ? 1 : s.dislikedIds.includes(id) ? -1 : 0);
    const upLikes = reactions
      .filter((id) => reactionOf(id) !== 0 && s.tracks[id])
      .map((id) => ({ user_id: uid, track_id: id, value: reactionOf(id) }));
    const delLikes = reactions.filter((id) => reactionOf(id) === 0);
    if (upLikes.length) check(await sb.from("likes").upsert(upLikes, { onConflict: "user_id,track_id" }));
    if (delLikes.length) check(await sb.from("likes").delete().eq("user_id", uid).in("track_id", delLikes));

    // 3. playlists (+ items replaced wholesale — playlists are small)
    for (const pid of playlists) {
      const p = s.playlists.find((x) => x.id === pid);
      if (!p) {
        check(await sb.from("playlists").delete().eq("id", pid).eq("user_id", uid));
        continue;
      }
      check(
        await sb.from("playlists").upsert(
          { id: p.id, user_id: uid, name: p.name, created_at: new Date(p.createdAt).toISOString(), updated_at: new Date().toISOString() },
          { onConflict: "id" },
        ),
      );
      check(await sb.from("playlist_items").delete().eq("playlist_id", p.id));
      const items = p.trackIds
        .filter((id) => s.tracks[id])
        .map((id, position) => ({ playlist_id: p.id, track_id: id, position }));
      if (items.length) check(await sb.from("playlist_items").insert(items));
    }

    // 4. artists
    const upArtists = artists
      .map((k) => s.artists.find((a) => a.key === k))
      .filter((a): a is FollowedArtist => !!a)
      .map((a) => ({
        user_id: uid,
        artist_key: a.key,
        artist_id: a.id ?? null,
        name: a.name,
        thumbnail: a.thumbnail ?? null,
        created_at: new Date(a.addedAt).toISOString(),
      }));
    const delArtists = artists.filter((k) => !s.artists.some((a) => a.key === k));
    if (upArtists.length) check(await sb.from("user_artists").upsert(upArtists, { onConflict: "user_id,artist_key" }));
    if (delArtists.length) check(await sb.from("user_artists").delete().eq("user_id", uid).in("artist_key", delArtists));

    // 5. plays (append-only)
    if (plays.length) {
      check(
        await sb.from("plays").insert(
          plays.map((p) => ({
            user_id: uid,
            track_id: p.t,
            artist_key: p.a,
            played_at: new Date(p.at).toISOString(),
            listened_s: p.s,
            completed: p.c,
            skipped: p.k,
          })),
        ),
      );
    }

    // 6. misc state
    if (state) {
      check(
        await sb.from("user_state").upsert(
          {
            user_id: uid,
            last_queue: s.lastQueue,
            search_history: s.searchHistory,
            onboarded: s.onboarded,
            ui_prefs: { hiddenSections: s.hiddenSections, theme: s.theme, lang: s.lang },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        ),
      );
    }
  } catch (e) {
    reactions.forEach((x) => dirty.reactions.add(x));
    playlists.forEach((x) => dirty.playlists.add(x));
    artists.forEach((x) => dirty.artists.add(x));
    dirty.state ||= state;
    dirty.plays.unshift(...plays);
    throw e;
  } finally {
    saveDirty();
  }
}

export async function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const sb = getSupabase();
  const user = useAuth.getState().user;
  if (!sb || !user || !hasDirty()) return;
  if (flushing) return flushing;
  useAuth.setState({ status: "syncing" });
  flushing = pushDirty(sb, user)
    .then(() => useAuth.setState({ status: "synced", error: null }))
    .catch((e: unknown) => useAuth.setState({ status: "error", error: friendly(e) }))
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

function scheduleFlush() {
  saveDirty();
  if (!useAuth.getState().user) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), 1500);
}

/* ------------------------------------------------------------------ */
/* Pull                                                                */
/* ------------------------------------------------------------------ */

async function fetchRemote(sb: SupabaseClient, uid: string): Promise<LibraryData> {
  const [likes, playlists, artists, plays, state] = await Promise.all([
    sb.from("likes").select("track_id, value, created_at, tracks(*)").eq("user_id", uid).order("created_at", { ascending: false }),
    sb
      .from("playlists")
      .select("id, name, created_at, playlist_items(track_id, position, tracks(*))")
      .eq("user_id", uid)
      .order("created_at", { ascending: false }),
    sb.from("user_artists").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
    sb
      .from("plays")
      .select("track_id, artist_key, played_at, listened_s, completed, skipped")
      .eq("user_id", uid)
      .order("played_at", { ascending: false })
      .limit(MAX_PLAYS),
    sb.from("user_state").select("*").eq("user_id", uid).maybeSingle(),
  ]);
  for (const r of [likes, playlists, artists, plays, state]) check(r);

  const tracks: Record<string, Track> = {};
  const likedIds: string[] = [];
  const dislikedIds: string[] = [];
  for (const row of (likes.data ?? []) as unknown as { track_id: string; value: number; tracks: TrackRow | null }[]) {
    if (row.tracks) tracks[row.track_id] = fromTrackRow(row.tracks);
    (row.value > 0 ? likedIds : dislikedIds).push(row.track_id);
  }

  const pls: Playlist[] = ((playlists.data ?? []) as unknown as {
    id: string;
    name: string;
    created_at: string;
    playlist_items: { track_id: string; position: number; tracks: TrackRow | null }[];
  }[]).map((p) => {
    const items = [...(p.playlist_items ?? [])].sort((a, b) => a.position - b.position);
    for (const it of items) if (it.tracks) tracks[it.track_id] = fromTrackRow(it.tracks);
    return { id: p.id, name: p.name, createdAt: Date.parse(p.created_at), trackIds: items.map((i) => i.track_id) };
  });

  const fa: FollowedArtist[] = ((artists.data ?? []) as {
    artist_key: string;
    artist_id: string | null;
    name: string;
    thumbnail: string | null;
    created_at: string;
  }[]).map((a) => ({
    key: a.artist_key,
    id: a.artist_id ?? undefined,
    name: a.name,
    thumbnail: a.thumbnail ?? undefined,
    addedAt: Date.parse(a.created_at),
  }));

  const pe: PlayEvent[] = ((plays.data ?? []) as {
    track_id: string;
    artist_key: string;
    played_at: string;
    listened_s: number;
    completed: boolean;
    skipped: boolean;
  }[])
    .map((p) => ({ t: p.track_id, a: p.artist_key, at: Date.parse(p.played_at), s: p.listened_s, c: p.completed, k: p.skipped }))
    .reverse();

  const st = state.data as {
    last_queue?: LibraryData["lastQueue"];
    search_history?: string[];
    onboarded?: boolean;
    ui_prefs?: { hiddenSections?: string[]; theme?: string; lang?: string } | null;
  } | null;

  return {
    ...EMPTY_LIBRARY,
    tracks,
    likedIds,
    dislikedIds,
    playlists: pls,
    artists: fa,
    plays: pe,
    searchHistory: st?.search_history ?? [],
    onboarded: st?.onboarded ?? false,
    hiddenSections: st?.ui_prefs?.hiddenSections ?? [],
    theme: st?.ui_prefs?.theme ?? EMPTY_LIBRARY.theme,
    lang: st?.ui_prefs?.lang ?? "",
    lastQueue: st?.last_queue?.tracks ? st.last_queue : EMPTY_LIBRARY.lastQueue,
  };
}

/** v1 stored everything as one JSON blob — import it once if the new tables are empty. */
async function fetchLegacy(sb: SupabaseClient, uid: string): Promise<Partial<LibraryData> | null> {
  const r = await sb.from("user_library").select("data").eq("user_id", uid).maybeSingle();
  if (r.error || !r.data) return null;
  return (r.data as { data: Partial<LibraryData> }).data ?? null;
}

const uniq = <T,>(a: T[]) => [...new Set(a)];

function merge(local: LibraryData, remote: LibraryData): LibraryData {
  const byId = new Map<string, Playlist>();
  for (const p of remote.playlists) byId.set(p.id, p);
  for (const p of local.playlists) {
    const r = byId.get(p.id);
    byId.set(p.id, r ? { ...r, trackIds: uniq([...r.trackIds, ...p.trackIds]) } : p);
  }
  const artists = new Map<string, FollowedArtist>();
  for (const a of [...remote.artists, ...local.artists]) if (!artists.has(a.key)) artists.set(a.key, a);
  const liked = uniq([...remote.likedIds, ...local.likedIds]);
  const disliked = uniq([...remote.dislikedIds, ...local.dislikedIds]).filter((id) => !liked.includes(id));
  const plays = [...remote.plays, ...local.plays]
    .filter((p, i, arr) => arr.findIndex((x) => x.t === p.t && x.at === p.at) === i)
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_PLAYS);
  return {
    tracks: { ...remote.tracks, ...local.tracks },
    likedIds: liked,
    dislikedIds: disliked,
    playlists: [...byId.values()].sort((a, b) => b.createdAt - a.createdAt),
    artists: [...artists.values()],
    plays,
    searchHistory: uniq([...local.searchHistory, ...remote.searchHistory]).slice(0, 15),
    onboarded: local.onboarded || remote.onboarded || remote.artists.length > 0,
    hiddenSections: remote.hiddenSections.length ? remote.hiddenSections : local.hiddenSections,
    theme: remote.theme !== EMPTY_LIBRARY.theme ? remote.theme : local.theme,
    lang: remote.lang || local.lang,
    lastQueue: local.lastQueue.tracks.length ? local.lastQueue : remote.lastQueue,
  };
}

let applyingRemote = false;

function snapshot(): LibraryData {
  const s = useLibrary.getState();
  return {
    tracks: s.tracks,
    likedIds: s.likedIds,
    dislikedIds: s.dislikedIds,
    playlists: s.playlists,
    artists: s.artists,
    plays: s.plays,
    searchHistory: s.searchHistory,
    onboarded: s.onboarded,
    hiddenSections: s.hiddenSections,
    theme: s.theme,
    lang: s.lang,
    lastQueue: s.lastQueue,
  };
}

function apply(data: LibraryData) {
  applyingRemote = true;
  useLibrary.setState((s) => ({ ...data, tracks: { ...s.tracks, ...data.tracks } }));
  applyingRemote = false;
}

async function initialSync(user: User) {
  const sb = getSupabase();
  if (!sb) return;
  useAuth.setState({ status: "syncing" });
  try {
    let remote = await fetchRemote(sb, user.id);
    const empty = !remote.likedIds.length && !remote.playlists.length && !remote.artists.length;
    if (empty) {
      const legacy = await fetchLegacy(sb, user.id);
      if (legacy) remote = merge(remote, { ...EMPTY_LIBRARY, ...legacy } as LibraryData);
    }
    const merged = merge(snapshot(), remote);
    apply(merged);
    markAll(merged);
    lastPullAt = Date.now();
    await flush();
    if (useAuth.getState().status === "syncing") useAuth.setState({ status: "synced", error: null });
  } catch (e) {
    useAuth.setState({ status: "error", error: friendly(e) });
  } finally {
    useAuth.setState({ loaded: true });
  }
}

async function pullIfIdle(force = false) {
  const sb = getSupabase();
  const user = useAuth.getState().user;
  if (!sb || !user || (!force && Date.now() - lastPullAt < 15_000)) return;
  await flush();
  if (hasDirty()) return; // offline — keep local changes
  try {
    const remote = await fetchRemote(sb, user.id);
    // keep the local queue (it's this device's playback)
    apply({ ...remote, lastQueue: useLibrary.getState().lastQueue });
    lastPullAt = Date.now();
    useAuth.setState({ status: "synced", error: null });
  } catch {
    /* offline */
  }
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

export function initCloudSync(): () => void {
  const sb = getSupabase();
  if (!sb) {
    useAuth.setState({ ready: true, loaded: true, status: "off" });
    return () => {};
  }
  loadDirty();

  let currentUserId: string | null = null;
  const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;
    useAuth.setState({
      user,
      ready: true,
      status: user ? useAuth.getState().status : "off",
      loaded: user ? useAuth.getState().loaded && user.id === currentUserId : true,
    });
    if (user && user.id !== currentUserId) {
      currentUserId = user.id;
      setTimeout(() => {
        const start = () => void initialSync(user);
        if (useLibrary.persist.hasHydrated()) start();
        else useLibrary.persist.onFinishHydration(start);
      }, 0);
    }
    if (!user) currentUserId = null;
  });

  const unsubStore = useLibrary.subscribe((state, prev) => {
    if (applyingRemote) return;
    diff(state, prev);
    if (hasDirty()) scheduleFlush();
  });

  const onVisible = () => {
    if (document.visibilityState === "visible") void pullIfIdle();
    else void flush();
  };
  document.addEventListener("visibilitychange", onVisible);
  const onOnline = () => void flush();
  window.addEventListener("online", onOnline);

  // Native app: finish Google sign-in when the system browser hands control back via the deep link.
  let removeUrlListener: (() => void) | null = null;
  if (isNative()) {
    void import("@capacitor/app").then(({ App }) =>
      App.addListener("appUrlOpen", async ({ url }) => {
        if (!url.startsWith(NATIVE_AUTH_REDIRECT)) return;
        const params = new URL(url.replace("#", "?")).searchParams;
        const code = params.get("code");
        try {
          if (code) {
            const { error } = await sb.auth.exchangeCodeForSession(code);
            if (error) throw error;
          } else if (params.get("error_description")) {
            throw new Error(params.get("error_description")!);
          }
        } catch (e) {
          useAuth.setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
        } finally {
          const { Browser } = await import("@capacitor/browser");
          void Browser.close().catch(() => {});
        }
      }).then((h) => {
        removeUrlListener = () => void h.remove();
      }),
    );
  }

  // Changes made on another device arrive via Supabase Realtime (tables are added to the
  // publication in schema.sql); a slow poll is the fallback.
  let rtTimer: ReturnType<typeof setTimeout> | null = null;
  const onRemoteChange = () => {
    if (rtTimer) clearTimeout(rtTimer);
    rtTimer = setTimeout(() => void pullIfIdle(true), 1200);
  };
  let channel: ReturnType<typeof sb.channel> | null = null;
  const unsubAuthRt = useAuth.subscribe((st, prev) => {
    if (st.user?.id === prev.user?.id) return;
    if (channel) void sb.removeChannel(channel);
    channel = null;
    if (!st.user) return;
    channel = sb.channel(`lib-${st.user.id}`);
    for (const table of ["likes", "playlists", "playlist_items", "user_artists", "user_state"]) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table, ...(table === "playlist_items" ? {} : { filter: `user_id=eq.${st.user.id}` }) } as never,
        onRemoteChange as never,
      );
    }
    channel.subscribe();
  });
  const poll = setInterval(() => {
    if (document.visibilityState === "visible") void pullIfIdle();
  }, 60_000);

  return () => {
    removeUrlListener?.();
    unsubAuthRt();
    if (channel) void sb.removeChannel(channel);
    clearInterval(poll);
    sub.subscription.unsubscribe();
    unsubStore();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
  };
}
