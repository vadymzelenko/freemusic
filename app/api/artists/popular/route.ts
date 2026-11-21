import { popularArtists } from "@/lib/yt-browse";
import { cachedJson, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = cachedJson("popular-artists", "public, s-maxage=86400, stale-while-revalidate=604800", async () => ({
  genres: await popularArtists(),
}));

export const OPTIONS = preflight;
