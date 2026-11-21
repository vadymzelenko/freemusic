import { relatedTracks } from "@/lib/yt";
import { VIDEO_ID_RE } from "@/lib/format";
import { errorMessage, json, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!VIDEO_ID_RE.test(id)) return json({ error: "Invalid id" }, { status: 400 });
  try {
    const tracks = await relatedTracks(id);
    return json({ tracks }, { cache: "public, s-maxage=1800, stale-while-revalidate=3600" });
  } catch (err) {
    console.error("[related]", err);
    return json({ error: errorMessage(err) }, { status: 502 });
  }
}

export const OPTIONS = preflight;
