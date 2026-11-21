import { artistKey, type PlayEvent, type Track } from "./types";
import type { LibraryData } from "@/store/library";

/*
 * Personal ranking on top of YouTube Music's candidates.
 *
 * YouTube already does the hard part (radio / related / artist top songs). Here we only:
 *   1. learn which artists the user likes or avoids (likes, dislikes, plays, skips, onboarding)
 *   2. drop disliked tracks and strongly disliked artists
 *   3. re-order candidates by that taste, demote things played very recently
 *   4. keep variety (no artist wall)
 */

type Taste = Pick<LibraryData, "likedIds" | "dislikedIds" | "artists" | "plays" | "tracks">;

export interface Profile {
  affinity: Map<string, number>;
  disliked: Set<string>;
  liked: Set<string>;
  recent: Map<string, number>; // trackId -> how many plays in recent window
}

const W = { follow: 4, like: 2, dislike: -3, complete: 0.4, skip: -0.8 };

export function buildProfile(s: Taste): Profile {
  const affinity = new Map<string, number>();
  const add = (key: string, v: number) => affinity.set(key, (affinity.get(key) ?? 0) + v);

  for (const a of s.artists) add(a.key, W.follow);
  for (const id of s.likedIds) {
    const t = s.tracks[id];
    if (t) add(artistKey(t.artist), W.like);
  }
  for (const id of s.dislikedIds) {
    const t = s.tracks[id];
    if (t) add(artistKey(t.artist), W.dislike);
  }

  // Plays decay with age: half-life ~30 days.
  const now = Date.now();
  const recent = new Map<string, number>();
  const recentFrom = s.plays.length - 40;
  s.plays.forEach((p: PlayEvent, i) => {
    const decay = Math.pow(0.5, (now - p.at) / (30 * 864e5));
    if (p.c) add(p.a, W.complete * decay);
    else if (p.k) add(p.a, W.skip * decay);
    if (i >= recentFrom) recent.set(p.t, (recent.get(p.t) ?? 0) + 1);
  });

  // squash to [-1, 1] so one very-played artist doesn't dominate everything
  for (const [k, v] of affinity) affinity.set(k, Math.tanh(v / 6));

  return { affinity, disliked: new Set(s.dislikedIds), liked: new Set(s.likedIds), recent };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/** Spread artists out: at most `maxRun` in a row and `maxTotal` per artist. */
export function diversify(tracks: Track[], maxRun = 1, maxTotal = 4): Track[] {
  const pending = [...tracks];
  const out: Track[] = [];
  const count = new Map<string, number>();
  while (pending.length) {
    const lastKeys = out.slice(-maxRun).map((t) => artistKey(t.artist));
    let idx = pending.findIndex((t) => {
      const k = artistKey(t.artist);
      return (count.get(k) ?? 0) < maxTotal && !(lastKeys.length === maxRun && lastKeys.every((x) => x === k));
    });
    if (idx === -1) {
      // nothing fits the rules — take the next one that is under the per-artist cap, else stop
      idx = pending.findIndex((t) => (count.get(artistKey(t.artist)) ?? 0) < maxTotal);
      if (idx === -1) break;
    }
    const [t] = pending.splice(idx, 1);
    const k = artistKey(t!.artist);
    count.set(k, (count.get(k) ?? 0) + 1);
    out.push(t!);
  }
  return out;
}

export interface RankOptions {
  limit?: number;
  /** 0 = keep YouTube's order, 1 = fully re-ordered by taste */
  personalize?: number;
  /** seed for stable shuffling (e.g. the day) */
  seed?: string;
  /** keep tracks that are already liked */
  includeLiked?: boolean;
  maxPerArtist?: number;
}

export function rank(candidates: Track[], profile: Profile, opts: RankOptions = {}): Track[] {
  const { limit = 50, personalize = 0.7, seed = "", includeLiked = true, maxPerArtist = 4 } = opts;
  const seen = new Set<string>();
  const scored: { t: Track; score: number }[] = [];
  candidates.forEach((t, i) => {
    if (seen.has(t.id) || profile.disliked.has(t.id)) return;
    seen.add(t.id);
    const aff = profile.affinity.get(artistKey(t.artist)) ?? 0;
    if (aff < -0.6) return; // artist the user clearly avoids
    if (!includeLiked && profile.liked.has(t.id)) return;
    const position = 1 / (1 + i / 8); // YouTube's own ordering signal
    const recentPenalty = (profile.recent.get(t.id) ?? 0) * 0.6;
    const noise = (hash(seed + t.id) - 0.5) * 0.5;
    const score = (1 - personalize) * position + personalize * (aff + noise) - recentPenalty;
    scored.push({ t, score });
  });
  scored.sort((a, b) => b.score - a.score);
  return diversify(
    scored.map((x) => x.t),
    1,
    maxPerArtist,
  ).slice(0, limit);
}

/** Light-touch filter for radio refills: keep YouTube's order, remove what the user doesn't want. */
export function filterRadio(tracks: Track[], profile: Profile): Track[] {
  const kept = tracks.filter((t) => {
    if (profile.disliked.has(t.id)) return false;
    return (profile.affinity.get(artistKey(t.artist)) ?? 0) >= -0.6;
  });
  return diversify(kept, 2, 6);
}

/** Top artists by affinity (for picking mix seeds). */
export function topArtistKeys(profile: Profile, n: number): string[] {
  return [...profile.affinity.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

export function daySeed(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
