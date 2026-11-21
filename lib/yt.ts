import "server-only";
import { Innertube, Misc, Platform, ProtoUtils, UniversalCache, YTNodes } from "youtubei.js";
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
const g = globalThis as unknown as { __yt?: GlobalYT; __ytBrowse?: GlobalYT };

export function hasVisitorIdInCookie(): boolean {
  return /(?:^|;\s*)VISITOR_INFO1_LIVE=/.test(process.env.YT_COOKIE ?? "");
}

function createInnertube(withPlayer: boolean): Promise<Innertube> {
  const cookie = process.env.YT_COOKIE?.trim() || undefined;
  const visitorId = cookie ? /(?:^|;\s*)VISITOR_INFO1_LIVE=([^;]+)/.exec(cookie)?.[1] : undefined;
  return Innertube.create({
    cookie,
    // The visitor id must match the logged-in cookie, otherwise YouTube answers
    // "UNPLAYABLE: The page needs to be reloaded".
    visitor_data: visitorId ? ProtoUtils.encodeVisitorData(visitorId, Math.floor(Date.now() / 1000)) : undefined,
    // Downloading + parsing the player JS is the slowest part of a cold start; only streams need it.
    retrieve_player: withPlayer,
    generate_session_locally: !cookie,
    enable_session_cache: false,
    cache: new UniversalCache(false),
    lang: "en",
    location: process.env.YT_LOCATION || "US",
  });
}

function memo(key: "__yt" | "__ytBrowse", withPlayer: boolean): Promise<Innertube> {
  const now = Date.now();
  const cur = g[key];
  if (!cur || now - cur.createdAt > SESSION_TTL_MS) {
    const promise = createInnertube(withPlayer).catch((err: unknown) => {
      g[key] = undefined; // don't memoize failures
      throw err;
    });
    g[key] = { promise, createdAt: now };
  }
  return g[key]!.promise;
}

/** Full client (with player JS) — needed to decipher stream URLs. */
export function getYT(): Promise<Innertube> {
  return memo("__yt", true);
}

/** Light client for search / browse / radio — no player download, much faster cold start. */
export function getYTBrowse(): Promise<Innertube> {
  // If the full client is already up, reuse it.
  if (g.__yt && Date.now() - g.__yt.createdAt <= SESSION_TTL_MS) return g.__yt.promise;
  return memo("__ytBrowse", false);
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

export function parseDuration(text: string | undefined): number {
  if (!text) return 0;
  return text
    .split(":")
    .map((p) => parseInt(p, 10))
    .reduce((acc, n) => (Number.isFinite(n) ? acc * 60 + n : acc), 0);
}

export function textOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "toString" in v) {
    const s = String(v);
    return s === "[object Object]" ? "" : s;
  }
  return "";
}

/** Upscales any googleusercontent image URL (artist photos, album art). */
export function hiResImage(thumbs: Thumb[] | undefined, size = 544, crop = false): string {
  const best = thumbs?.length ? [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0] : undefined;
  const url = best?.url ?? "";
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    const suffix = `=w${size}-h${size}${crop ? "-p" : ""}-l90-rj`;
    return url.replace(/=w\d+-h\d+[^/]*$/, suffix).replace(/=s\d+[^/]*$/, `=s${size}${crop ? "-c" : ""}`);
  }
  return url.startsWith("//") ? `https:${url}` : url;
}

const TYPE_WORDS = /^(song|video|single|ep|album|песня|видео|сингл|альбом|трек|episode|podcast)$/i;

/** "Song • Кино • Группа крови • 4:47" → ["Кино"]. Prefers runs that link to an artist channel. */
export function artistsFromSubtitle(text: unknown): string[] {
  const t = text as { runs?: { text?: string; endpoint?: { payload?: { browseId?: string } } }[]; toString(): string } | undefined;
  if (!t) return [];
  const linked = (t.runs ?? [])
    .filter((r) => r.endpoint?.payload?.browseId?.startsWith("UC") && r.text)
    .map((r) => r.text!.trim());
  if (linked.length) return [...new Set(linked)];
  const parts = String(t).split(/\s+[•·]\s+/).map((x) => x.trim()).filter(Boolean);
  const first = parts.find((x) => !TYPE_WORDS.test(x) && !/^\d+:\d{2}/.test(x) && !/views|просмотр/i.test(x));
  return first ? [first] : [];
}

export function fromListItem(
  item: YTNodes.MusicResponsiveListItem,
  fallback?: { cover?: string; album?: string; albumId?: string; artist?: string; artistId?: string },
): Track | null {
  const id = item.id;
  if (!id || (item.item_type !== "song" && item.item_type !== "video")) return null;
  const people = item.artists?.length ? item.artists : item.authors?.length ? item.authors : item.author ? [item.author] : [];
  let names = people.map((a) => a.name).filter(Boolean);
  // Some results (often non-Latin titles) come without parsed artists — read them from the subtitle column.
  if (!names.length) names = artistsFromSubtitle(item.flex_columns?.[1]?.title);
  const thumbs = item.thumbnails;
  return {
    id,
    title: item.title ?? "Unknown",
    artist: names.join(", ") || fallback?.artist || "Unknown",
    artistId: people.find((a) => a.channel_id)?.channel_id || fallback?.artistId,
    album: item.album?.name || fallback?.album || undefined,
    albumId: item.album?.id || fallback?.albumId || undefined,
    duration: item.duration?.seconds ?? parseDuration(item.duration?.text),
    cover: thumbs?.length ? hiResCover(thumbs, id) : fallback?.cover || hiResCover(undefined, id),
  };
}

function fromPanelVideo(v: YTNodes.PlaylistPanelVideo): Track | null {
  if (!v.video_id) return null;
  const artists = v.artists?.map((a) => a.name).filter(Boolean) ?? [];
  return {
    id: v.video_id,
    title: textOf(v.title) || "Unknown",
    artist: artists.join(", ") || v.author || "Unknown",
    artistId: v.artists?.find((a) => a.channel_id)?.channel_id,
    album: v.album?.name || undefined,
    albumId: v.album?.id || undefined,
    duration: v.duration?.seconds ?? parseDuration(v.duration?.text),
    cover: hiResCover(v.thumbnail, v.video_id),
  };
}

export function dedupe(tracks: (Track | null)[]): Track[] {
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

const relatedCache = new TTLCache<Track[]>(30 * 60 * 1000, 300);

export async function relatedTracks(id: string): Promise<Track[]> {
  const hit = relatedCache.get(id);
  if (hit) return hit;

  const yt = await getYTBrowse();
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
  itag?: number;
  durationMs?: number;
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
// ANDROID_VR / IOS reject authenticated requests (HTTP 400), so they're not used with a cookie.
const COOKIE_CLIENTS: Types.InnerTubeClient[] = ["TV", "TV_SIMPLY", "WEB", "YTMUSIC", "MWEB", "WEB_EMBEDDED"];

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

type Fmt = Misc.Format;

/**
 * Picks the audio format Safari handles best:
 *  - AAC in MP4 only (no webm/opus)
 *  - prefer itag 140 (AAC-LC 128k). HE-AAC (mp4a.40.5 / 40.29, itag 139) uses SBR and makes
 *    Safari report DOUBLE the real duration (silence at the end).
 *  - avoid DRC ("stable volume") and dubbed tracks
 */
function pickAudioFormat(formats: Fmt[]): Fmt | undefined {
  const audio = formats.filter((f) => f.has_audio && !f.has_video && f.mime_type.startsWith("audio/mp4"));
  const score = (f: Fmt) =>
    (f.itag === 140 ? 1000 : 0) +
    (/mp4a\.40\.(5|29)/.test(f.mime_type) ? -800 : 0) +
    (f.is_drc ? -300 : 0) +
    (f.is_dubbed ? -200 : 0) +
    (f.is_original === false ? -100 : 0) +
    Math.min(f.bitrate ?? 0, 200_000) / 1000;
  return audio.sort((a, b) => score(b) - score(a))[0];
}

export async function resolveWithClient(
  id: string,
  client: Types.InnerTubeClient,
  verify = true,
): Promise<AudioSource> {
  const yt = await getYT();
  const info = await yt.getBasicInfo(id, { client });
  const status = info.playability_status?.status;
  if (status && status !== "OK") {
    throw new Error(`${client}: ${status} ${info.playability_status?.reason ?? ""}`.trim());
  }
  const formats = [...(info.streaming_data?.adaptive_formats ?? []), ...(info.streaming_data?.formats ?? [])] as Fmt[];
  const format = pickAudioFormat(formats) ?? info.chooseFormat({ type: "audio", quality: "best", format: "mp4" });
  const url = await format.decipher(yt.session.player);
  if (!url) throw new Error(`${client}: empty url`);
  if (verify) {
    try {
      await probe(url);
    } catch (e) {
      throw new Error(`${client}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return {
    url,
    mimeType: (format.mime_type || "audio/mp4").split(";")[0] ?? "audio/mp4",
    contentLength: format.content_length || undefined,
    bitrate: format.bitrate,
    itag: format.itag,
    durationMs: format.approx_duration_ms || undefined,
    client,
    resolvedAt: Date.now(),
  };
}

/** Last client that worked — tried first next time (saves failed round-trips). */
let preferredClient: Types.InnerTubeClient | null = null;

async function resolveAudio(id: string, verify: boolean, avoid?: string): Promise<AudioSource> {
  const errors: string[] = [];
  const order = clientOrder();
  const clients = preferredClient && preferredClient !== avoid
    ? [preferredClient, ...order.filter((c) => c !== preferredClient)]
    : order.filter((c) => c !== avoid).concat(avoid ? [avoid as Types.InnerTubeClient] : []);
  for (const [i, client] of clients.entries()) {
    try {
      // The preferred client is trusted without a probe (fast path); the stream route
      // re-resolves with verification if googlevideo refuses the URL.
      const src = await resolveWithClient(id, client, verify || i > 0);
      preferredClient = client;
      return src;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      if (client === preferredClient) preferredClient = null;
    }
  }
  throw new Error(`Could not resolve audio for ${id}: ${errors.join(" | ")}`);
}

/** Returns a cached direct googlevideo URL, resolving (once, deduplicated) if needed. */
export async function getAudioSource(
  id: string,
  opts: { fresh?: boolean; verify?: boolean; avoid?: string } = {},
): Promise<AudioSource> {
  if (opts.fresh) audioCache.delete(id);
  const hit = audioCache.get(id);
  if (hit) return hit;

  let p = inflight.get(id);
  if (!p) {
    p = resolveAudio(id, !!opts.verify, opts.avoid)
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
