import { genreArtists, genres } from "@/lib/meta/deezer";
import { cachedJson, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?id=152 → that genre's top artists; no id → list of genres */
export const GET = cachedJson("meta-genres", "public, s-maxage=86400, stale-while-revalidate=604800", async (p) => {
  const id = Number(p.get("id"));
  if (id) return { artists: await genreArtists(id) };
  return { genres: await genres() };
});
export const OPTIONS = preflight;
