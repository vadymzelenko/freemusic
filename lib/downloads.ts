"use client";

import { apiUrl } from "@/lib/format";
import type { Track } from "@/lib/types";
import { useDownloads } from "@/store/downloads";
import { isNative, nativeEngine } from "@/lib/native/platform";

export const AUDIO_CACHE = "freemusic-audio-v1";
export const COVER_CACHE = "freemusic-covers-v1";
const CONCURRENCY = 3;

export function offlineUrl(id: string): string {
  return `/offline/audio?id=${encodeURIComponent(id)}`;
}

const queue: Track[] = [];
let running = 0;

function supported(): boolean {
  return typeof window !== "undefined" && (isNative() || "caches" in window);
}

/** Native app: keep an index of downloads for the offline screen (works without the website). */
async function writeNativeIndex() {
  if (!isNative()) return;
  const items = Object.values(useDownloads.getState().items).map((d) => ({
    id: d.track.id,
    title: d.track.title,
    artist: d.track.artist,
    cover: d.track.cover,
  }));
  await (await nativeEngine()).writeOfflineIndex(items);
}

async function fetchWithProgress(url: string, onProgress: (p: number) => void): Promise<Blob> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  const total = Number(res.headers.get("content-length")) || 0;
  const type = res.headers.get("content-type") || "audio/mp4";
  if (!res.body || !total) return new Blob([await res.arrayBuffer()], { type });
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.byteLength;
    onProgress(Math.min(0.99, got / total));
  }
  return new Blob(chunks as BlobPart[], { type });
}

async function downloadOne(t: Track): Promise<void> {
  const { setStatus, markDone } = useDownloads.getState();
  setStatus(t.id, { state: "downloading", progress: 0 });
  if (isNative()) {
    try {
      let last = 0;
      const bytes = await (await nativeEngine()).downloadToFile(t.id, "dl", (p) => {
        if (p - last > 0.04) {
          last = p;
          setStatus(t.id, { state: "downloading", progress: p });
        }
      });
      markDone(t, bytes);
      void writeNativeIndex();
    } catch (e) {
      setStatus(t.id, { state: "error", message: e instanceof Error ? e.message : String(e) });
    }
    return;
  }
  try {
    let last = 0;
    const blob = await fetchWithProgress(apiUrl(`/api/stream?id=${encodeURIComponent(t.id)}`), (p) => {
      if (p - last > 0.04) {
        last = p;
        setStatus(t.id, { state: "downloading", progress: p });
      }
    });
    const cache = await caches.open(AUDIO_CACHE);
    await cache.put(
      offlineUrl(t.id),
      new Response(blob, {
        headers: { "Content-Type": blob.type || "audio/mp4", "Content-Length": String(blob.size) },
      }),
    );
    // Best effort: keep the cover for offline display (opaque response is fine for <img>).
    try {
      const covers = await caches.open(COVER_CACHE);
      if (t.cover && !(await covers.match(t.cover))) {
        await covers.put(t.cover, await fetch(t.cover, { mode: "no-cors" }));
      }
    } catch {
      /* ignore */
    }
    markDone(t, blob.size);
  } catch (e) {
    setStatus(t.id, { state: "error", message: e instanceof Error ? e.message : String(e) });
  }
}

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const t = queue.shift()!;
    running++;
    void downloadOne(t).finally(() => {
      running--;
      pump();
    });
  }
}

/** Queue tracks for offline use (skips ones already stored / in progress). */
export function downloadTracks(tracks: Track[]): number {
  if (!supported()) return 0;
  void navigator.storage?.persist?.().catch(() => {});
  const { items, active, setStatus } = useDownloads.getState();
  let added = 0;
  for (const t of tracks) {
    const st = active[t.id];
    if (items[t.id] || (st && st.state !== "error")) continue;
    setStatus(t.id, { state: "queued" });
    queue.push(t);
    added++;
  }
  pump();
  return added;
}

export async function removeDownload(id: string): Promise<void> {
  useDownloads.getState().remove(id);
  if (isNative()) {
    await (await nativeEngine()).deleteFile(id, "dl");
    void writeNativeIndex();
    return;
  }
  if (!supported()) return;
  const cache = await caches.open(AUDIO_CACHE);
  await cache.delete(offlineUrl(id));
}

export async function removeAllDownloads(): Promise<void> {
  const ids = Object.keys(useDownloads.getState().items);
  for (const id of ids) useDownloads.getState().remove(id);
  if (isNative()) {
    const e = await nativeEngine();
    for (const id of ids) await e.deleteFile(id, "dl");
    void writeNativeIndex();
    return;
  }
  if (supported()) {
    await caches.delete(AUDIO_CACHE);
    await caches.delete(COVER_CACHE);
  }
}

/** Removes entries whose audio disappeared from Cache Storage (e.g. iOS evicted it). */
export async function reconcileDownloads(): Promise<void> {
  if (isNative()) {
    const have = new Set(await (await nativeEngine()).listFiles("dl"));
    for (const id of Object.keys(useDownloads.getState().items)) if (!have.has(id)) useDownloads.getState().remove(id);
    void writeNativeIndex();
    return;
  }
  if (!supported()) return;
  const cache = await caches.open(AUDIO_CACHE);
  const keys = new Set((await cache.keys()).map((r) => new URL(r.url).searchParams.get("id")));
  for (const id of Object.keys(useDownloads.getState().items)) {
    if (!keys.has(id)) useDownloads.getState().remove(id);
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
