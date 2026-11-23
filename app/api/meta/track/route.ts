import { lookupTrack } from "@/lib/meta/deezer";
import { cachedJson, json, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?artist=&title= → { track: { cover, duration, album } | null } */
export const GET = cachedJson("meta-track", "public, s-maxage=604800", async (p) => {
  const title = p.get("title")?.trim().slice(0, 160);
  if (!title) return json({ error: "title required" }, { status: 400 });
  return { track: await lookupTrack((p.get("artist") ?? "").trim().slice(0, 120), title) };
});
export const OPTIONS = preflight;
