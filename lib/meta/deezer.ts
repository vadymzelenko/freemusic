import "server-only";
import { TTLCache } from "@/lib/ttl-cache";

/*
 * Deezer public API (no key, no auth) — used only for METADATA: genres, artist photos,
 * related artists, song covers/durations. No audio comes from Deezer.
 */

const BASE = "https://api.deezer.com";
const H = 60 * 60 * 1000;

export interface MetaArtist {
  id: string;
  name: string;
  picture: string;
  fans?: number;
}
export interface MetaGenre {
  id: number;
  name: string;
  picture: string;
}
export interface MetaTrack {
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
}

async function dz<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(6000), cache: "no-store" });
  if (!res.ok) throw new Error(`deezer ${res.status}`);
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (data && typeof data === "object" && "error" in data && data.error) throw new Error(data.error.message ?? "deezer error");
  return data;
}

type DzArtist = { id: number; name: string; picture_big?: string; picture_medium?: string; nb_fan?: number };
const toArtist = (a: DzArtist): MetaArtist => ({
  id: `dz${a.id}`,
  name: a.name,
  picture: a.picture_big || a.picture_medium || "",
  fans: a.nb_fan,
});

const genresCache = new TTLCache<MetaGenre[]>(24 * H, 1);
export async function genres(): Promise<MetaGenre[]> {
  const hit = genresCache.get("g");
  if (hit) return hit;
  const r = await dz<{ data: { id: number; name: string; picture_big: string }[] }>("/genre");
  const out = r.data.filter((g) => g.id !== 0).map((g) => ({ id: g.id, name: g.name, picture: g.picture_big }));
  genresCache.set("g", out);
  return out;
}

const genreArtistsCache = new TTLCache<MetaArtist[]>(12 * H, 100);
export async function genreArtists(genreId: number): Promise<MetaArtist[]> {
  const key = String(genreId);
  const hit = genreArtistsCache.get(key);
  if (hit) return hit;
  const r = await dz<{ data: DzArtist[] }>(`/genre/${genreId}/artists`);
  const out = r.data.map(toArtist);
  genreArtistsCache.set(key, out);
  return out;
}

const searchCache = new TTLCache<MetaArtist[]>(H, 500);
export async function searchArtists(q: string): Promise<MetaArtist[]> {
  const key = q.toLowerCase();
  const hit = searchCache.get(key);
  if (hit) return hit;
  const r = await dz<{ data: DzArtist[] }>(`/search/artist?q=${encodeURIComponent(q)}&limit=24`);
  const out = r.data.map(toArtist);
  searchCache.set(key, out);
  return out;
}

const relatedCache = new TTLCache<MetaArtist[]>(12 * H, 500);
export async function relatedArtists(id: string): Promise<MetaArtist[]> {
  const n = id.replace(/^dz/, "");
  const hit = relatedCache.get(n);
  if (hit) return hit;
  const r = await dz<{ data: DzArtist[] }>(`/artist/${encodeURIComponent(n)}/related?limit=12`);
  const out = r.data.map(toArtist);
  relatedCache.set(n, out);
  return out;
}

const trackCache = new TTLCache<MetaTrack | null>(24 * H, 5000);
/** Cover art + duration for what a station is playing ("Artist" + "Title"). */
export async function lookupTrack(artist: string, title: string): Promise<MetaTrack | null> {
  const key = `${artist}|${title}`.toLowerCase();
  const hit = trackCache.get(key);
  if (hit !== undefined) return hit;
  const q = artist ? `artist:"${artist}" track:"${title}"` : title;
  let r = await dz<{ data: { title: string; duration: number; artist: { name: string }; album: { title: string; cover_big: string } }[] }>(
    `/search/track?q=${encodeURIComponent(q)}&limit=1`,
  ).catch(() => ({ data: [] }));
  if (!r.data.length && artist) {
    r = await dz<typeof r>(`/search/track?q=${encodeURIComponent(`${artist} ${title}`)}&limit=1`).catch(() => ({ data: [] }));
  }
  const t = r.data[0];
  const out = t ? { title: t.title, artist: t.artist.name, album: t.album.title, cover: t.album.cover_big, duration: t.duration } : null;
  trackCache.set(key, out);
  return out;
}
