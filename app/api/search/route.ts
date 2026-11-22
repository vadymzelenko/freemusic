import "@/lib/yt"; // configures the server YouTube provider
import { search, type SearchType } from "@/lib/yt-browse";
import { cachedJson, json, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: SearchType[] = ["all", "song", "album", "artist"];

export const GET = cachedJson("search", "public, s-maxage=600, stale-while-revalidate=3600", async (p) => {
  const q = p.get("q")?.trim();
  if (!q || q.length > 200) return json({ error: "Missing or too long q" }, { status: 400 });
  const type = (TYPES.includes(p.get("type") as SearchType) ? p.get("type") : "song") as SearchType;
  const res = await search(q, type);
  // `tracks` kept for backwards compatibility with older clients.
  return { ...res, tracks: res.songs };
});

export const OPTIONS = preflight;
