import { getAudioSource, getYT, serverFetch, STREAM_FETCH_HEADERS, type AudioSource } from "@/lib/yt";
import { VIDEO_ID_RE } from "@/lib/format";
import { CORS_HEADERS, errorMessage, json, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** googlevideo throttles/refuses huge single requests — serve at most 10MB per response. */
const MAX_CHUNK = 10 * 1024 * 1024;

const UPSTREAM_HEADERS = STREAM_FETCH_HEADERS;

// Start the (slow) Innertube + player bootstrap as soon as this function instance boots.
void getYT().catch(() => {});

type ByteRange = { start: number; end: number | undefined };

function parseRange(header: string | null): ByteRange | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, a = "", b = ""] = m;
  if (a === "" && b === "") return null;
  if (a === "") return { start: -parseInt(b, 10), end: undefined }; // suffix range: last N bytes
  return { start: parseInt(a, 10), end: b === "" ? undefined : parseInt(b, 10) };
}

function baseHeaders(src: AudioSource): Headers {
  const h = new Headers(CORS_HEADERS);
  h.set("Content-Type", src.mimeType || "audio/mp4");
  h.set("Accept-Ranges", "bytes");
  h.set("Cache-Control", "private, max-age=3600");
  h.set("X-Audio-Client", src.client);
  return h;
}

async function fetchUpstream(
  src: AudioSource,
  range: ByteRange | null,
  rawRange: string | null,
  signal: AbortSignal,
): Promise<{ upstream: globalThis.Response; status: number; headers: Headers }> {
  const headers = baseHeaders(src);
  const total = src.contentLength;

  // Known size: use googlevideo's `range` query param and synthesize a proper 206.
  if (total) {
    let start = 0;
    let end = total - 1;
    let status = 200;
    if (range) {
      start = range.start < 0 ? Math.max(0, total + range.start) : range.start;
      end = Math.min(range.end ?? total - 1, total - 1, start + MAX_CHUNK - 1);
      status = 206;
      if (start >= total || start > end) {
        const h = new Headers(headers);
        h.set("Content-Range", `bytes */${total}`);
        return { upstream: new globalThis.Response(null), status: 416, headers: h };
      }
    }
    const upstream = await serverFetch(`${src.url}&range=${start}-${end}`, {
      headers: UPSTREAM_HEADERS,
      signal,
      cache: "no-store",
    });
    headers.set("Content-Length", String(end - start + 1));
    if (status === 206) headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
    return { upstream, status, headers };
  }

  // Unknown size: forward the Range header as-is and mirror upstream headers.
  const fwd = new Headers(UPSTREAM_HEADERS);
  fwd.set("Range", rawRange ?? "bytes=0-");
  const upstream = await serverFetch(src.url, { headers: fwd, signal, cache: "no-store" });
  for (const k of ["content-length", "content-range"]) {
    const v = upstream.headers.get(k);
    if (v) headers.set(k, v);
  }
  return { upstream, status: upstream.status, headers };
}

async function handle(req: Request, method: "GET" | "HEAD"): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const id = params.get("id") ?? "";
  if (!VIDEO_ID_RE.test(id)) return json({ error: "Invalid id" }, { status: 400 });

  const rawRange = req.headers.get("range");
  const range = parseRange(rawRange);

  try {
    let src = await getAudioSource(id, { fresh: params.has("fresh"), verify: params.has("fresh") });

    if (method === "HEAD" && src.contentLength) {
      const h = baseHeaders(src);
      h.set("Content-Length", String(src.contentLength));
      return new Response(null, { status: 200, headers: h });
    }

    let res = await fetchUpstream(src, range, rawRange, req.signal);
    if (res.status !== 416 && !res.upstream.ok) {
      // URL expired / IP-bound to another instance / throttled — resolve again once.
      await res.upstream.body?.cancel().catch(() => {});
      src = await getAudioSource(id, { fresh: true, verify: true, avoid: src.client });
      res = await fetchUpstream(src, range, rawRange, req.signal);
    }

    if (res.status !== 416 && !res.upstream.ok) {
      await res.upstream.body?.cancel().catch(() => {});
      return json({ error: `Upstream responded ${res.upstream.status}` }, { status: 502, cache: "no-store" });
    }

    return new Response(method === "HEAD" ? null : res.upstream.body, {
      status: res.status,
      headers: res.headers,
    });
  } catch (err) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.error("[stream]", id, err);
    return json({ error: errorMessage(err) }, { status: 502, cache: "no-store" });
  }
}

export function GET(req: Request) {
  return handle(req, "GET");
}

export function HEAD(req: Request) {
  return handle(req, "HEAD");
}

export const OPTIONS = preflight;
