import "@/lib/yt"; // configures the server YouTube provider
import { getLyrics } from "@/lib/lyrics";
import { VIDEO_ID_RE } from "@/lib/format";
import { cachedJson, json, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = cachedJson("lyrics", "public, s-maxage=604800, stale-while-revalidate=2592000", async (p) => {
  const id = p.get("id") ?? "";
  if (!VIDEO_ID_RE.test(id)) return json({ error: "Invalid id" }, { status: 400 });
  return getLyrics({
    id,
    title: p.get("title") ?? "",
    artist: p.get("artist") ?? "",
    album: p.get("album") || undefined,
    duration: Number(p.get("duration")) || 0,
  });
});

export const OPTIONS = preflight;
