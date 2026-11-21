import { getAudioSource } from "@/lib/yt";
import { VIDEO_ID_RE } from "@/lib/format";
import { errorMessage, json, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pre-warms the server cache with the direct googlevideo URL for a track. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!VIDEO_ID_RE.test(id)) return json({ error: "Invalid id" }, { status: 400 });
  try {
    const src = await getAudioSource(id);
    return json(
      { ok: true, id, mimeType: src.mimeType, bitrate: src.bitrate, client: src.client },
      { cache: "no-store" },
    );
  } catch (err) {
    console.error("[prepare]", err);
    return json({ ok: false, error: errorMessage(err) }, { status: 502, cache: "no-store" });
  }
}

export const OPTIONS = preflight;
