import { artistKey, type Track } from "@/lib/types";
import type { LibraryData } from "@/store/library";
import { buildProfile } from "@/lib/recommend";
import type { NowPlaying } from "./types";

/*
 * How well does what a station is playing RIGHT NOW match the listener?
 *   your liked track      → 100  ("Ваш трек")
 *   artist you love       → 50…80 ("Ваш артист")
 *   disliked track        → −100 (never switch to it)
 *   artist you avoid      → −50
 * Everything else is 0 — the station is still in your genres, just not a personal hit.
 */

export type MatchKind = "track" | "artist" | "none" | "avoid";

export interface Match {
  score: number;
  kind: MatchKind;
}

/** "The Beatles - Let It Be (Remastered 2009) [Live]" → comparable form */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]/g, " ")
    .replace(/\s+(feat\.?|ft\.?|featuring|with)\s+.*$/i, " ")
    .replace(/^the\s+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface Taste {
  tracks: Set<string>; // "artist|title"
  disliked: Set<string>;
  artists: Map<string, number>; // normalized first artist → affinity 0..1
  avoid: Set<string>;
}

const key = (artist: string, title: string) => `${norm(artist.split(/,|&| x /i)[0] ?? artist)}|${norm(title)}`;

export function buildTaste(lib: Pick<LibraryData, "likedIds" | "dislikedIds" | "tracks" | "artists" | "plays">): Taste {
  const tracks = new Set<string>();
  const disliked = new Set<string>();
  for (const id of lib.likedIds) {
    const t = lib.tracks[id];
    if (t) tracks.add(key(t.artist, t.title));
  }
  for (const id of lib.dislikedIds) {
    const t = lib.tracks[id];
    if (t) disliked.add(key(t.artist, t.title));
  }
  const profile = buildProfile(lib);
  const artists = new Map<string, number>();
  const avoid = new Set<string>();
  for (const [k, v] of profile.affinity) {
    const n = norm(k);
    if (v > 0.15) artists.set(n, v);
    if (v < -0.5) avoid.add(n);
  }
  for (const a of lib.artists) artists.set(norm(a.name), Math.max(artists.get(norm(a.name)) ?? 0, 0.8));
  return { tracks, disliked, artists, avoid };
}

export function matchNowPlaying(np: NowPlaying | null | undefined, taste: Taste): Match {
  if (!np || !np.title) return { score: 0, kind: "none" };
  const artist = np.artist || "";
  const k = key(artist, np.title);
  if (taste.disliked.has(k)) return { score: -100, kind: "avoid" };
  if (artist && taste.tracks.has(k)) return { score: 100, kind: "track" };
  // stations sometimes swap fields ("Title - Artist")
  if (artist && taste.tracks.has(key(np.title, artist))) return { score: 100, kind: "track" };
  const a = norm(artistKey(artist));
  if (a && taste.avoid.has(a)) return { score: -50, kind: "avoid" };
  const aff = taste.artists.get(a);
  if (aff !== undefined) return { score: 50 + Math.round(aff * 30), kind: "artist" };
  return { score: 0, kind: "none" };
}

/** A song heard on air as a library Track (likes, history, stats). Stable id from artist+title. */
export function songTrack(np: Pick<NowPlaying, "artist" | "title">, extra: Partial<Track> = {}): Track {
  return {
    id: `r:${key(np.artist, np.title)}`,
    title: np.title,
    artist: np.artist,
    duration: 0,
    cover: "",
    ...extra,
  };
}

/** Is this something worth calling a "song" (not an ad / talk / station id)? */
export function isSong(np: NowPlaying | null | undefined): np is NowPlaying {
  return !!np && np.kind === "music" && !!np.artist && !!np.title;
}
