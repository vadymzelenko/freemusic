import { searchArtists } from "@/lib/meta/deezer";
import { cachedJson, json, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = cachedJson("meta-artists", "public, s-maxage=86400", async (p) => {
  const q = p.get("q")?.trim().slice(0, 80);
  if (!q) return json({ error: "q required" }, { status: 400 });
  return { artists: await searchArtists(q) };
});
export const OPTIONS = preflight;
