import { relatedArtists } from "@/lib/meta/deezer";
import { cachedJson, json, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = cachedJson("meta-related", "public, s-maxage=86400", async (p) => {
  const id = p.get("id") ?? "";
  if (!/^dz\d+$/.test(id)) return json({ error: "bad id" }, { status: 400 });
  return { artists: await relatedArtists(id) };
});
export const OPTIONS = preflight;
