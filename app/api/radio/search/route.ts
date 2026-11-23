import { searchStations } from "@/lib/radio/browser";
import { cachedJson, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?q=name&tag=rock&cc=PL&limit=40 */
export const GET = cachedJson("radio-search", "public, s-maxage=1800, stale-while-revalidate=86400", async (p) => ({
  stations: await searchStations({
    q: p.get("q")?.trim().slice(0, 80) || undefined,
    tag: p.get("tag")?.trim().slice(0, 40) || undefined,
    countrycode: p.get("cc")?.trim().toUpperCase().slice(0, 2) || undefined,
    limit: Math.min(Number(p.get("limit")) || 40, 100),
  }),
}));

export const OPTIONS = preflight;
