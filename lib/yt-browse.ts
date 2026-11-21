import "server-only";
import { YTNodes } from "youtubei.js";
import { TTLCache } from "./ttl-cache";
import { artistsFromSubtitle, dedupe, fromListItem, getYTBrowse as getYT, hiResCover, hiResImage, relatedTracks } from "./yt";
import type {
  AlbumPage,
  AlbumSummary,
  ArtistPage,
  ArtistSummary,
  MixPool,
  SearchResults,
  Suggestions,
  Track,
} from "./types";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

type Thumb = { url: string; width?: number; height?: number };
type TextLike = { toString(): string; runs?: unknown[] } | undefined | null;

function str(t: TextLike): string {
  if (!t) return "";
  const s = t.toString();
  return s === "[object Object]" ? "" : s;
}

/** Finds the first browseId in a Text's runs (e.g. artist link in an album header). */
function browseIdIn(t: TextLike, prefix = "UC"): string | undefined {
  const runs = (t?.runs ?? []) as { endpoint?: { payload?: { browseId?: string } } }[];
  for (const r of runs) {
    const id = r.endpoint?.payload?.browseId;
    if (id && id.startsWith(prefix)) return id;
  }
  return undefined;
}

function yearIn(s: string): string | undefined {
  return /\b(19|20)\d{2}\b/.exec(s)?.[0];
}

function albumFromListItem(item: YTNodes.MusicResponsiveListItem): AlbumSummary | null {
  if (!item.id || item.item_type !== "album") return null;
  const by = item.artists?.[0] ?? item.author;
  return {
    id: item.id,
    title: item.title ?? item.name ?? "Album",
    artist: by?.name ?? "",
    artistId: by?.channel_id,
    year: item.year || yearIn(str(item.subtitle)),
    cover: hiResImage(item.thumbnails as Thumb[]),
  };
}

function artistFromListItem(item: YTNodes.MusicResponsiveListItem): ArtistSummary | null {
  if (!item.id || (item.item_type !== "artist" && item.item_type !== "library_artist")) return null;
  return {
    id: item.id,
    name: item.name ?? item.title ?? "",
    thumbnail: hiResImage(item.thumbnails as Thumb[], 544, true),
    subtitle: item.subscribers,
  };
}

function fromTwoRow(item: YTNodes.MusicTwoRowItem): { album?: AlbumSummary; artist?: ArtistSummary; track?: Track } {
  if (!item.id) return {};
  const title = str(item.title);
  const thumbs = item.thumbnail as Thumb[];
  const by = item.artists?.[0] ?? item.author;
  if (item.item_type === "album") {
    const sub = str(item.subtitle);
    return {
      album: {
        id: item.id,
        title,
        artist: by?.name ?? "",
        artistId: by?.channel_id,
        year: item.year || yearIn(sub),
        cover: hiResImage(thumbs),
        kind: /single/i.test(sub) ? "single" : /\bEP\b/.test(sub) ? "ep" : "album",
      },
    };
  }
  if (item.item_type === "artist") {
    return { artist: { id: item.id, name: title, thumbnail: hiResImage(thumbs, 544, true), subtitle: item.subscribers } };
  }
  if (item.item_type === "song" || item.item_type === "video") {
    return {
      track: {
        id: item.id,
        title,
        artist: item.artists?.map((a) => a.name).join(", ") || by?.name || artistsFromSubtitle(item.subtitle).join(", ") || "",
        artistId: by?.channel_id,
        duration: 0,
        cover: hiResImage(thumbs),
      },
    };
  }
  return {};
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export type SearchType = "all" | "song" | "album" | "artist";
const searchCache = new TTLCache<SearchResults>(10 * MIN, 400);

export async function search(query: string, type: SearchType): Promise<SearchResults> {
  const key = `${type}:${query.trim().toLowerCase()}`;
  const hit = searchCache.get(key);
  if (hit) return hit;

  const yt = await getYT();
  const res = await yt.music.search(query, type === "all" ? undefined : { type });
  const songs: (Track | null)[] = [];
  const albums: (AlbumSummary | null)[] = [];
  const artists: (ArtistSummary | null)[] = [];

  const take = (item: YTNodes.MusicResponsiveListItem) => {
    if (item.item_type === "song" || (item.item_type === "video" && type !== "all")) songs.push(fromListItem(item));
    else if (item.item_type === "album") albums.push(albumFromListItem(item));
    else if (item.item_type === "artist") artists.push(artistFromListItem(item));
  };

  for (const shelf of res.contents ?? []) {
    if (shelf.is(YTNodes.MusicShelf)) {
      for (const item of shelf.contents) if (item.is(YTNodes.MusicResponsiveListItem)) take(item);
    } else if (shelf.is(YTNodes.MusicCardShelf)) {
      // The "top result" itself (e.g. the most popular song for the query).
      const videoId = (shelf.on_tap as unknown as { payload?: { videoId?: string } } | undefined)?.payload?.videoId;
      if (videoId) {
        songs.unshift({
          id: videoId,
          title: str(shelf.title) || "Unknown",
          artist: artistsFromSubtitle(shelf.subtitle).join(", ") || "Unknown",
          artistId: browseIdIn(shelf.subtitle),
          duration: 0,
          cover: hiResCover((shelf.thumbnail?.contents ?? []) as Thumb[], videoId),
        });
      }
      // Its contents are list items (songs/videos/albums).
      for (const item of (shelf as unknown as { contents?: YTNodes.MusicResponsiveListItem[] }).contents ?? []) {
        if (item?.is?.(YTNodes.MusicResponsiveListItem)) take(item);
      }
    }
  }

  const out: SearchResults = {
    songs: dedupe(songs),
    albums: albums.filter((a): a is AlbumSummary => !!a).filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i),
    artists: artists.filter((a): a is ArtistSummary => !!a).filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i),
  };
  searchCache.set(key, out);
  return out;
}

const suggestCache = new TTLCache<Suggestions>(10 * MIN, 1000);

export async function suggest(query: string): Promise<Suggestions> {
  const key = query.trim().toLowerCase();
  const hit = suggestCache.get(key);
  if (hit) return hit;
  const yt = await getYT();
  const sections = await yt.music.getSearchSuggestions(query);
  const out: Suggestions = { queries: [], songs: [], artists: [], albums: [] };
  for (const section of sections) {
    for (const node of section.contents) {
      if (node.is(YTNodes.SearchSuggestion)) {
        const q = str(node.suggestion);
        if (q) out.queries.push(q);
      } else if (node.is(YTNodes.MusicResponsiveListItem)) {
        if (node.item_type === "song" || node.item_type === "video") {
          const t = fromListItem(node);
          if (t) out.songs.push(t);
        } else if (node.item_type === "artist") {
          const a = artistFromListItem(node);
          if (a) out.artists.push(a);
        } else if (node.item_type === "album") {
          const a = albumFromListItem(node);
          if (a) out.albums.push(a);
        }
      }
    }
  }
  out.queries = out.queries.slice(0, 7);
  suggestCache.set(key, out);
  return out;
}

/* ------------------------------------------------------------------ */
/* Artist                                                              */
/* ------------------------------------------------------------------ */

const artistCache = new TTLCache<ArtistPage>(6 * HOUR, 500);

export async function getArtistPage(id: string): Promise<ArtistPage> {
  const hit = artistCache.get(id);
  if (hit) return hit;
  const yt = await getYT();
  const a = await yt.music.getArtist(id);

  let name = "";
  let thumbs: Thumb[] = [];
  let description: string | undefined;
  const h = a.header;
  if (h?.is(YTNodes.MusicImmersiveHeader)) {
    name = str(h.title);
    thumbs = (h.thumbnail?.contents ?? []) as Thumb[];
    description = str(h.description) || undefined;
  } else if (h?.is(YTNodes.MusicVisualHeader)) {
    name = str(h.title);
    thumbs = (h.thumbnail ?? []) as Thumb[];
  } else if (h?.is(YTNodes.MusicHeader)) {
    name = str(h.title);
  }

  const songs: (Track | null)[] = [];
  const albums: AlbumSummary[] = [];
  const singles: AlbumSummary[] = [];
  const related: ArtistSummary[] = [];

  for (const section of a.sections) {
    if (section.is(YTNodes.MusicShelf)) {
      for (const item of section.contents) {
        if (item.is(YTNodes.MusicResponsiveListItem)) songs.push(fromListItem(item, { artist: name, artistId: id }));
      }
    } else if (section.is(YTNodes.MusicCarouselShelf)) {
      const title = str(section.header?.title).toLowerCase();
      for (const item of section.contents) {
        if (!item.is(YTNodes.MusicTwoRowItem)) continue;
        const r = fromTwoRow(item);
        if (r.album) {
          if (!r.album.artist) r.album.artist = name;
          (/single|ep/.test(title) || r.album.kind === "single" ? singles : albums).push(r.album);
        } else if (r.artist && /fans|similar|also like|related/.test(title)) {
          related.push(r.artist);
        }
      }
    }
  }

  const page: ArtistPage = {
    id,
    name: name || "Artist",
    thumbnail: hiResImage(thumbs, 544, true),
    description,
    songs: dedupe(songs),
    albums,
    singles,
    related,
  };
  artistCache.set(id, page);
  return page;
}

/* ------------------------------------------------------------------ */
/* Album                                                               */
/* ------------------------------------------------------------------ */

const albumCache = new TTLCache<AlbumPage>(12 * HOUR, 500);

export async function getAlbumPage(id: string): Promise<AlbumPage> {
  const hit = albumCache.get(id);
  if (hit) return hit;
  const yt = await getYT();
  const al = await yt.music.getAlbum(id);

  let title = "";
  let artist = "";
  let artistId: string | undefined;
  let year: string | undefined;
  let thumbs: Thumb[] = [];
  let kind: string | undefined;
  const h = al.header;
  if (h?.is(YTNodes.MusicResponsiveHeader)) {
    title = str(h.title);
    artist = str(h.strapline_text_one);
    artistId = browseIdIn(h.strapline_text_one);
    const sub = str(h.subtitle);
    year = yearIn(sub);
    kind = /single/i.test(sub) ? "single" : /\bEP\b/.test(sub) ? "ep" : "album";
    thumbs = (h.thumbnail?.contents ?? []) as Thumb[];
  } else if (h?.is(YTNodes.MusicDetailHeader)) {
    title = str(h.title);
    artist = h.author?.name ?? "";
    artistId = h.author?.channel_id;
    year = h.year || yearIn(str(h.subtitle));
    thumbs = (h.thumbnails ?? []) as Thumb[];
  }
  const cover = hiResImage(thumbs);
  const tracks = dedupe(
    al.contents.map((item) =>
      item.is(YTNodes.MusicResponsiveListItem)
        ? fromListItem(item, { cover, album: title, albumId: id, artist, artistId })
        : null,
    ),
  ).map((t) => (t.cover.includes("i.ytimg.com") && cover ? { ...t, cover } : t));

  const page: AlbumPage = { id, title: title || "Album", artist, artistId, year, cover, kind, tracks };
  albumCache.set(id, page);
  return page;
}

/* ------------------------------------------------------------------ */
/* Mix candidates for the home feed                                    */
/* ------------------------------------------------------------------ */

export async function mixPools(artistIds: string[], trackIds: string[]): Promise<MixPool[]> {
  const jobs: Promise<MixPool | null>[] = [
    ...artistIds.slice(0, 6).map(async (id) => {
      const a = await getArtistPage(id);
      return a.songs.length
        ? { kind: "artist" as const, seedId: id, seedName: a.name, cover: a.thumbnail, tracks: a.songs.slice(0, 12) }
        : null;
    }),
    ...trackIds.slice(0, 4).map(async (id) => {
      const tracks = await relatedTracks(id);
      return tracks.length
        ? { kind: "track" as const, seedId: id, seedName: "", cover: tracks[0]!.cover, tracks: tracks.slice(0, 20) }
        : null;
    }),
  ];
  const settled = await Promise.allSettled(jobs);
  return settled.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
}

/* ------------------------------------------------------------------ */
/* Popular artists for onboarding                                      */
/* ------------------------------------------------------------------ */

export const POPULAR_ARTIST_NAMES: { genre: string; names: string[] }[] = [
  { genre: "Рок", names: ["Metallica", "AC/DC", "Nirvana", "Linkin Park", "Queen", "Foo Fighters", "Red Hot Chili Peppers", "Arctic Monkeys"] },
  { genre: "Метал", names: ["Slipknot", "System Of A Down", "Rammstein", "Iron Maiden", "Avenged Sevenfold", "Bring Me The Horizon"] },
  { genre: "Поп", names: ["The Weeknd", "Dua Lipa", "Taylor Swift", "Billie Eilish", "Ed Sheeran", "Imagine Dragons"] },
  { genre: "Хип-хоп", names: ["Eminem", "Kendrick Lamar", "Drake", "Travis Scott", "Kanye West", "Post Malone"] },
  { genre: "Электроника", names: ["Daft Punk", "The Prodigy", "Avicii", "Calvin Harris", "Skrillex", "Fred again.."] },
  { genre: "Инди и альтернатива", names: ["Radiohead", "Tame Impala", "The Strokes", "Gorillaz", "Muse", "Twenty One Pilots"] },
  { genre: "На русском", names: ["Кино", "Сплин", "Би-2", "Земфира", "Мумий Тролль", "Король и Шут"] },
  { genre: "Українською", names: ["Океан Ельзи", "Бумбокс", "Kalush", "Jerry Heil", "ONUKA", "The Hardkiss"] },
];

const popularCache = new TTLCache<{ genre: string; artists: ArtistSummary[] }[]>(24 * HOUR, 2);

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

export async function popularArtists(): Promise<{ genre: string; artists: ArtistSummary[] }[]> {
  const hit = popularCache.get("all");
  if (hit) return hit;
  const flat = POPULAR_ARTIST_NAMES.flatMap((g) => g.names.map((n) => ({ genre: g.genre, name: n })));
  const resolved = await pool(flat, 8, async ({ genre, name }) => {
    try {
      const r = await search(name, "artist");
      return { genre, artist: r.artists[0] ?? null };
    } catch {
      return { genre, artist: null };
    }
  });
  const seen = new Set<string>();
  const out = POPULAR_ARTIST_NAMES.map((g) => ({
    genre: g.genre,
    artists: resolved
      .filter((r) => r.genre === g.genre && r.artist && !seen.has(r.artist.id) && seen.add(r.artist.id))
      .map((r) => r.artist!),
  })).filter((g) => g.artists.length);
  if (out.some((g) => g.artists.length)) popularCache.set("all", out);
  return out;
}
