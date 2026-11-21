import { clientOrder, getYT, hasVisitorIdInCookie, resolveWithClient } from "@/lib/yt";
import { VIDEO_ID_RE } from "@/lib/format";
import { errorMessage, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Diagnostics: tries every InnerTube client for one track and reports what failed.
 * Open /api/debug?id=VIDEO_ID in the browser. Never exposes the cookie itself.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") || "CD-E-LDc384"; // Enter Sandman
  if (!VIDEO_ID_RE.test(id)) return json({ error: "Invalid id" }, { status: 400 });

  let session: unknown;
  try {
    const yt = await getYT();
    session = {
      ok: true,
      logged_in: yt.session.logged_in,
      player_id: yt.session.player?.player_id ?? null,
      signature_timestamp: yt.session.player?.signature_timestamp ?? null,
    };
  } catch (e) {
    session = { ok: false, error: errorMessage(e) };
  }

  const results = [];
  for (const client of clientOrder()) {
    const t0 = Date.now();
    try {
      const src = await resolveWithClient(id, client);
      results.push({ client, ok: true, ms: Date.now() - t0, mime: src.mimeType, bitrate: src.bitrate, bytes: src.contentLength });
    } catch (e) {
      results.push({ client, ok: false, ms: Date.now() - t0, error: errorMessage(e) });
    }
  }

  return json(
    {
      id,
      has_cookie: Boolean(process.env.YT_COOKIE),
      cookie_has_visitor_id: hasVisitorIdInCookie(),
      region: process.env.VERCEL_REGION ?? null,
      session,
      results,
    },
    { cache: "no-store" },
  );
}
