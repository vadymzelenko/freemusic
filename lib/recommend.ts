import { artistKey, type PlayEvent } from "./types";
import type { LibraryData } from "@/store/library";

/*
 * Taste profile: which artists the listener likes or avoids, learned from
 * survey picks, 👍/👎 on songs heard on air, and listening history (songs heard
 * from the start count up, quick switches away count down).
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
