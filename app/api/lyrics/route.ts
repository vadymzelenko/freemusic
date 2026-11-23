import { getLyrics } from "@/lib/lyrics";
import { cachedJson, json, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?artist=&title=&duration= → synced (LRC) or plain lyrics from LRCLIB */
export const GET = cachedJson("lyrics", "public, s-maxage=604800, stale-while-revalidate=2592000", async (p) => {
  const artist = (p.get("artist") ?? "").slice(0, 120);
  const title = (p.get("title") ?? "").slice(0, 160);
  if (!title) return json({ error: "title required" }, { status: 400 });
  return getLyrics({
    id: `${artist.toLowerCase()}|${title.toLowerCase()}`,
    title,
    artist,
    album: p.get("album") || undefined,
    duration: Number(p.get("duration")) || 0,
  });
});

export const OPTIONS = preflight;
