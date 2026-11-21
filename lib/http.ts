export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
};

export function json(data: unknown, init: ResponseInit & { cache?: string } = {}): Response {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (init.cache) headers.set("Cache-Control", init.cache);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Wraps a GET handler: JSON response with CDN caching, uniform error handling. */
export function cachedJson<T>(
  label: string,
  cache: string,
  fn: (params: URLSearchParams) => Promise<T | Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      const out = await fn(new URL(req.url).searchParams);
      if (out instanceof Response) return out;
      return json(out, { cache });
    } catch (err) {
      console.error(`[${label}]`, err);
      return json({ error: errorMessage(err) }, { status: 502, cache: "no-store" });
    }
  };
}
