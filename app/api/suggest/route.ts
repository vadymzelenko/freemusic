import { suggest } from "@/lib/yt-browse";
import { cachedJson, json, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = cachedJson("suggest", "public, s-maxage=3600, stale-while-revalidate=86400", async (p) => {
  const q = p.get("q")?.trim();
  if (!q || q.length > 100) return json({ error: "Missing or too long q" }, { status: 400 });
  return suggest(q);
});

export const OPTIONS = preflight;
