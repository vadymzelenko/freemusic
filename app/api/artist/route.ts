import "@/lib/yt"; // configures the server YouTube provider
import { getArtistPage } from "@/lib/yt-browse";
import { cachedJson, json, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = cachedJson("artist", "public, s-maxage=21600, stale-while-revalidate=86400", async (p) => {
  const id = p.get("id") ?? "";
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(id)) return json({ error: "Invalid id" }, { status: 400 });
  return getArtistPage(id);
});

export const OPTIONS = preflight;
