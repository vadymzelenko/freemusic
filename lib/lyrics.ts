import { YTNodes } from "youtubei.js";
import { TTLCache } from "./ttl-cache";
import { getYTBrowse, ytFetch } from "./yt-core";

export interface LyricsResult {
  /** LRC text with [mm:ss.xx] timestamps (karaoke mode) */
  synced?: string;
  plain?: string;
  instrumental?: boolean;
  source?: "lrclib" | "youtube";
}

const cache = new TTLCache<LyricsResult>(24 * 60 * 60 * 1000, 2000);
const UA = "vzMusic/1.0 (personal music player)";

/** Strip "(Remastered 2021)", "- Live", "feat. X" etc. — LRCLIB matches clean titles better. */
function cleanTitle(t: string): string {
  return t
    .replace(/\s*[([](?:feat\.?|ft\.?|with|remaster|remastered|live|official|lyrics?|audio|video|mono|stereo|\d{4})[^)\]]*[)\]]/gi, "")
    .replace(/\s+-\s+(?:remaster|remastered|live|single version|radio edit).*$/i, "")
    .trim();
}
const firstArtist = (a: string) => a.split(/,|&| feat\.? | ft\.? /i)[0]!.trim();

type Lrc = { syncedLyrics?: string | null; plainLyrics?: string | null; instrumental?: boolean; duration?: number };

async function lrclib(title: string, artist: string, album: string | undefined, duration: number): Promise<LyricsResult | null> {
  const get = async (endpoint: "get" | "search", params: Record<string, string>) => {
    const url = `https://lrclib.net/api/${endpoint}?${new URLSearchParams(params)}`;
    const res = await ytFetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return (await res.json()) as Lrc | Lrc[];
  };
  const t = cleanTitle(title);
  const a = firstArtist(artist);

  // 1. exact match (fast, uses duration ±2s)
  if (duration > 0) {
    const exact = (await get("get", { track_name: t, artist_name: a, ...(album ? { album_name: album } : {}), duration: String(Math.round(duration)) }).catch(() => null)) as Lrc | null;
    if (exact && (exact.syncedLyrics || exact.plainLyrics || exact.instrumental)) {
      return { synced: exact.syncedLyrics ?? undefined, plain: exact.plainLyrics ?? undefined, instrumental: exact.instrumental, source: "lrclib" };
    }
  }
  // 2. fuzzy search, prefer synced + closest duration
  const list = (await get("search", { track_name: t, artist_name: a }).catch(() => null)) as Lrc[] | null;
  if (Array.isArray(list) && list.length) {
    const best = [...list].sort((x, y) => {
      const sx = (x.syncedLyrics ? 0 : 100) + (duration ? Math.abs((x.duration ?? 0) - duration) : 0);
      const sy = (y.syncedLyrics ? 0 : 100) + (duration ? Math.abs((y.duration ?? 0) - duration) : 0);
      return sx - sy;
    })[0]!;
    if (!duration || !best.duration || Math.abs(best.duration - duration) < 8 || !best.syncedLyrics) {
      return { synced: best.syncedLyrics ?? undefined, plain: best.plainLyrics ?? undefined, instrumental: best.instrumental, source: "lrclib" };
    }
  }
  return null;
}

async function youtube(id: string): Promise<LyricsResult | null> {
  const yt = await getYTBrowse();
  const shelf = await yt.music.getLyrics(id);
  const text = shelf?.is(YTNodes.MusicDescriptionShelf) ? shelf.description.toString() : "";
  return text ? { plain: text, source: "youtube" } : null;
}

export async function getLyrics(q: { id: string; title: string; artist: string; album?: string; duration: number }): Promise<LyricsResult> {
  const hit = cache.get(q.id);
  if (hit) return hit;
  const result =
    (await lrclib(q.title, q.artist, q.album, q.duration).catch(() => null)) ??
    (await youtube(q.id).catch(() => null)) ??
    {};
  cache.set(q.id, result);
  return result;
}
