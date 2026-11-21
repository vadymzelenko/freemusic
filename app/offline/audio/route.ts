import { VIDEO_ID_RE } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Normally intercepted by the service worker (serves the downloaded file).
 * If the SW isn't controlling the page yet, fall back to streaming.
 */
export function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!VIDEO_ID_RE.test(id)) return new Response("Invalid id", { status: 400 });
  return Response.redirect(new URL(`/api/stream?id=${id}`, url.origin), 307);
}
