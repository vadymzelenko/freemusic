import { searchTracks } from "@/lib/yt";
import { errorMessage, json, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return json({ error: "Missing q" }, { status: 400 });
  if (q.length > 200) return json({ error: "Query too long" }, { status: 400 });
  try {
    const tracks = await searchTracks(q);
    return json({ tracks }, { cache: "public, s-maxage=600, stale-while-revalidate=3600" });
  } catch (err) {
    console.error("[search]", err);
    return json({ error: errorMessage(err) }, { status: 502 });
  }
}

export const OPTIONS = preflight;
