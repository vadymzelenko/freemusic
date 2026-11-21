import { getAlbumPage } from "@/lib/yt-browse";
import { cachedJson, json, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = cachedJson("album", "public, s-maxage=43200, stale-while-revalidate=86400", async (p) => {
  const id = p.get("id") ?? "";
  if (!/^[A-Za-z0-9_-]{10,60}$/.test(id)) return json({ error: "Invalid id" }, { status: 400 });
  return getAlbumPage(id);
});

export const OPTIONS = preflight;
