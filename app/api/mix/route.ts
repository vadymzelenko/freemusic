import { mixPools } from "@/lib/yt-browse";
import { VIDEO_ID_RE } from "@/lib/format";
import { cachedJson, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const list = (v: string | null) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** ?a=artistId,artistId&t=trackId,trackId → candidate pools for the home feed. */
export const GET = cachedJson("mix", "public, s-maxage=1800, stale-while-revalidate=7200", async (p) => {
  const artists = list(p.get("a")).filter((id) => /^[A-Za-z0-9_-]{10,40}$/.test(id));
  const tracks = list(p.get("t")).filter((id) => VIDEO_ID_RE.test(id));
  return { pools: await mixPools(artists, tracks) };
});

export const OPTIONS = preflight;
