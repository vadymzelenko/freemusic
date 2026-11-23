import { countries, languages, tags } from "@/lib/radio/browser";
import { cachedJson, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Countries / genres (tags) / languages with station counts — for the Explore screen. */
export const GET = cachedJson("radio-facets", "public, s-maxage=43200, stale-while-revalidate=604800", async () => {
  const [c, t, l] = await Promise.all([countries(), tags(), languages()]);
  return { countries: c, tags: t, languages: l };
});

export const OPTIONS = preflight;
