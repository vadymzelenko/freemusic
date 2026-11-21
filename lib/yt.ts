import "server-only";
import { Innertube, Platform, UniversalCache, YTNodes } from "youtubei.js";
import type { Types } from "youtubei.js";
import { TTLCache } from "./ttl-cache";
import type { Track } from "./types";

/* ------------------------------------------------------------------ */
/* JavaScript evaluator for the YouTube player (n / signature decipher) */
/* ------------------------------------------------------------------ */

// youtubei.js >= 14 ships without an evaluator; the player script extracted
// by the library is executed here to decipher googlevideo URLs.
Platform.shim.eval = (data: Types.BuildScriptResult, env: Record<string, Types.VMPrimative>) => {
  const arg = (v: Types.VMPrimative | undefined) => JSON.stringify(typeof v === "string" ? v : "");
  const code = `${data.output}\nreturn process(${arg(env.n)}, ${arg(env.sp)}, ${arg(env.sig)});`;
  return new Function(code)() as Types.EvalResult;
};

/* ------------------------------------------------------------------ */
/* Innertube singleton                                                 */
/* ------------------------------------------------------------------ */

const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // player JS rotates — refresh periodically

type GlobalYT = { promise: Promise<Innertube>; createdAt: number } | undefined;
const g = globalThis as unknown as { __yt?: GlobalYT };

export function getYT(): Promise<Innertube> {
  const now = Date.now();
  if (!g.__yt || now - g.__yt.createdAt > SESSION_TTL_MS) {
    const promise = Innertube.create({
      cookie: process.env.YT_COOKIE || undefined,
      retrieve_player: true,
      generate_session_locally: true,
      cache: new UniversalCache(false),
      lang: "en",
      location: process.env.YT_LOCATION || "US",
    }).catch((err: unknown) => {
      g.__yt = undefined; // don't memoize failures
      throw err;
    });
    g.__yt = { promise, createdAt: now };
  }
  return g.__yt.promise;
}

/* ------------------------------------------------------------------ */
/* Metadata helpers                                                    */
/* ------------------------------------------------------------------ */

type Thumb = { url: string; width?: number; height?: number };

/** Upscale a YT Music / YouTube thumbnail to ~544x544. */
export function hiResCover(thumbs: Thumb[] | undefined, videoId: string): string {
  const best = thumbs?.length
    ? [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
    : undefined;
  const url = best?.url;
  if (url && /googleusercontent\.com|ggpht\.com/.test(url)) {
    // lh3.googleusercontent.com/...=w120-h120-l90-rj  ->  =w544-h544-l90-rj
    return url.replace(/=w\d+-h\d+[^/]*$/, "=w544-h544-l90-rj").replace(/=s\d+[^/]*$/, "=s544");
  }
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function parseDuration(text: string | undefined): number {
  if (!text) return 0;
  return text
    .split(":")
    .map((p) => parseInt(p, 10))
    .reduce((acc, n) => (Number.isFinite(n) ? acc * 60 + n : acc), 0);
}

function textOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "toString" in v) {
    const s = String(v);
    return s === "[object Object]" ? "" : s;
  }
  return "";
}

function fromListItem(item: YTNodes.MusicResponsiveListItem): Track | null {
  const id = item.id;
  if (!id || (item.item_type !== "song" && item.item_type !== "video")) return null;
  const artists =
    item.artists?.map((a) => a.name).filter(Boolean) ??
    item.authors?.map((a) => a.name).filter(Boolean) ??
    (item.author?.name ? [item.author.name] : []);
  return {
    id,
    title: item.title ?? "Unknown",
    artist: artists.join(", ") || "Unknown",
    album: item.album?.name || undefined,
    duration: item.duration?.seconds ?? parseDuration(item.duration?.text),
    cover: hiResCover(item.thumbnails, id),
  };
}

function fromPanelVideo(v: YTNodes.PlaylistPanelVideo): Track | null {
  if (!v.video_id) return null;
  const artists = v.artists?.map((a) => a.name).filter(Boolean) ?? [];
  return {
    id: v.video_id,
    title: textOf(v.title) || "Unknown",
    artist: artists.join(", ") || v.author || "Unknown",
    album: v.album?.name || undefined,
    duration: v.duration?.seconds ?? parseDuration(v.duration?.text),
    cover: hiResCover(v.thumbnail, v.video_id),
  };
}

function dedupe(tracks: (Track | null)[]): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of tracks) {
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Search / related                                                    */
/* ------------------------------------------------------------------ */

const searchCache = new TTLCache<Track[]>(10 * 60 * 1000, 300);

export async function searchTracks(query: string): Promise<Track[]> {
  const key = query.trim().toLowerCase();
  const hit = searchCache.get(key);
  if (hit) return hit;

  const yt = await getYT();
  const res = await yt.music.search(query, { type: "song" });
  const items: (Track | null)[] = [];
  for (const shelf of res.contents ?? []) {
    if (shelf.is(YTNodes.MusicShelf)) {
      for (const item of shelf.contents) {
        if (item.is(YTNodes.MusicResponsiveListItem)) items.push(fromListItem(item));
      }
    }
  }
  const tracks = dedupe(items);
  searchCache.set(key, tracks);
  return tracks;
}

const relatedCache = new TTLCache<Track[]>(30 * 60 * 1000, 300);

export async function relatedTracks(id: string): Promise<Track[]> {
  const hit = relatedCache.get(id);
  if (hit) return hit;

  const yt = await getYT();
  const panel = await yt.music.getUpNext(id, true);
  const items: (Track | null)[] = [];
  for (const node of panel.contents) {
    if (node.is(YTNodes.PlaylistPanelVideo)) items.push(fromPanelVideo(node));
    else if (node.is(YTNodes.PlaylistPanelVideoWrapper)) {
      const primary = node.primary;
      if (primary?.is(YTNodes.PlaylistPanelVideo)) items.push(fromPanelVideo(primary));
    }
  }
  const tracks = dedupe(items).filter((t) => t.id !== id);
  relatedCache.set(id, tracks);
  return tracks;
}

/* ------------------------------------------------------------------ */
/* Audio stream resolution                                             */
/* ------------------------------------------------------------------ */

export interface AudioSource {
  url: string;
  mimeType: string;
  contentLength?: number;
  bitrate?: number;
  client: string;
  resolvedAt: number;
}

/** googlevideo URLs live ~6h; we keep them for 3h. */
const STREAM_TTL_MS = 3 * 60 * 60 * 1000;
const audioCache = new TTLCache<AudioSource>(STREAM_TTL_MS, 1000);
const inflight = new Map<string, Promise<AudioSource>>();

// Without a cookie the mobile/VR clients are the most permissive; with a cookie the
// TV/web clients use the logged-in session (ANDROID_VR/IOS ignore cookies).
const DEFAULT_CLIENTS: Types.InnerTubeClient[] = ["ANDROID_VR", "IOS", "TV", "WEB_EMBEDDED", "MWEB", "TV_EMBEDDED"];
const COOKIE_CLIENTS: Types.InnerTubeClient[] = ["TV", "WEB_EMBEDDED", "MWEB", "ANDROID_VR", "IOS", "TV_EMBEDDED"];

export function clientOrder(): Types.InnerTubeClient[] {
  const env = process.env.YT_CLIENTS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (env?.length) return env as Types.InnerTubeClient[];
  return process.env.YT_COOKIE ? COOKIE_CLIENTS : DEFAULT_CLIENTS;
}

export const STREAM_FETCH_HEADERS: Record<string, string> = {
  accept: "*/*",
  origin: "https://www.youtube.com",
  referer: "https://www.youtube.com/",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
};

/** Checks that googlevideo actually serves the URL to this server (not 403 / PO-token wall). */
async function probe(url: string): Promise<void> {
  const res = await fetch(`${url}&range=0-1023`, {
    headers: STREAM_FETCH_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  await res.body?.cancel().catch(() => {});
  if (!res.ok) throw new Error(`googlevideo ${res.status}`);
}

export async function resolveWithClient(id: string, client: Types.InnerTubeClient): Promise<AudioSource> {
  const yt = await getYT();
  const info = await yt.getBasicInfo(id, { client });
  const status = info.playability_status?.status;
  if (status && status !== "OK") {
    throw new Error(`${client}: ${status} ${info.playability_status?.reason ?? ""}`.trim());
  }
  // Safari only plays AAC in MP4 reliably — never pick webm/opus.
  const format = info.chooseFormat({ type: "audio", quality: "best", format: "mp4" });
  const url = await format.decipher(yt.session.player);
  if (!url) throw new Error(`${client}: empty url`);
  try {
    await probe(url);
  } catch (e) {
    throw new Error(`${client}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return {
    url,
    mimeType: (format.mime_type || "audio/mp4").split(";")[0] ?? "audio/mp4",
    contentLength: format.content_length || undefined,
    bitrate: format.bitrate,
    client,
    resolvedAt: Date.now(),
  };
}

async function resolveAudio(id: string): Promise<AudioSource> {
  const errors: string[] = [];
  for (const client of clientOrder()) {
    try {
      return await resolveWithClient(id, client);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(`Could not resolve audio for ${id}: ${errors.join(" | ")}`);
}

/** Returns a cached direct googlevideo URL, resolving (once, deduplicated) if needed. */
export async function getAudioSource(id: string, opts: { fresh?: boolean } = {}): Promise<AudioSource> {
  if (opts.fresh) audioCache.delete(id);
  const hit = audioCache.get(id);
  if (hit) return hit;

  let p = inflight.get(id);
  if (!p) {
    p = resolveAudio(id)
      .then((src) => {
        audioCache.set(id, src);
        return src;
      })
      .finally(() => inflight.delete(id));
    inflight.set(id, p);
  }
  return p;
}

export function invalidateAudioSource(id: string): void {
  audioCache.delete(id);
}
