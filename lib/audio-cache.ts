"use client";

import { apiUrl } from "@/lib/format";

/*
 * Short-term audio buffer (separate from user downloads):
 *  - the NEXT track is fetched ahead, so skipping / auto-advance starts instantly
 *  - the last few played tracks stay cached, so "previous" / replay doesn't re-download
 * Stored in Cache Storage under the same /offline/audio?id= key the service worker serves.
 * The set of cached ids is kept in memory so the player can choose `audio.src` synchronously.
 */

export const RECENT_CACHE = "freemusic-recent-v1";
const MAX_RECENT = 6;
const key = (id: string) => `/offline/audio?id=${encodeURIComponent(id)}`;

const ready = new Set<string>(); // fully cached ids, most recent last
const inflight = new Map<string, Promise<boolean>>();

const supported = () => typeof window !== "undefined" && "caches" in window && !!navigator.serviceWorker?.controller;

export function isBuffered(id: string): boolean {
  return ready.has(id);
}

function touch(id: string) {
  ready.delete(id);
  ready.add(id);
}

async function evict(keep: Set<string>) {
  if (ready.size <= MAX_RECENT) return;
  const cache = await caches.open(RECENT_CACHE);
  for (const id of [...ready]) {
    if (ready.size <= MAX_RECENT) break;
    if (keep.has(id)) continue;
    ready.delete(id);
    await cache.delete(key(id));
  }
}

/** Fetches the whole track into the buffer (no-op if cached / in flight). */
export function bufferTrack(id: string, keep: string[] = []): Promise<boolean> {
  if (!supported()) return Promise.resolve(false);
  if (ready.has(id)) {
    touch(id);
    return Promise.resolve(true);
  }
  let p = inflight.get(id);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(apiUrl(`/api/stream?id=${encodeURIComponent(id)}`), { cache: "no-store" });
        if (!res.ok) return false;
        const blob = await res.blob();
        const expected = Number(res.headers.get("content-length")) || 0;
        if (!blob.size || (expected && blob.size < expected)) return false;
        const cache = await caches.open(RECENT_CACHE);
        await cache.put(
          key(id),
          new Response(blob, { headers: { "Content-Type": blob.type || "audio/mp4", "Content-Length": String(blob.size) } }),
        );
        touch(id);
        await evict(new Set([id, ...keep]));
        return true;
      } catch {
        return false;
      } finally {
        inflight.delete(id);
      }
    })();
    inflight.set(id, p);
  }
  return p;
}

/** Marks a buffered track as just used (so it is evicted last). */
export function markUsed(id: string) {
  if (ready.has(id)) touch(id);
}

/** Restores the in-memory index from Cache Storage after a reload. */
export async function initAudioBuffer(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const cache = await caches.open(RECENT_CACHE);
    for (const req of await cache.keys()) {
      const id = new URL(req.url).searchParams.get("id");
      if (id) ready.add(id);
    }
  } catch {
    /* ignore */
  }
}
