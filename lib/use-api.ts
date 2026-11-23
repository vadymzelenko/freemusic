"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/format";

/** One request without caching (callers inspect the JSON; non-2xx is not thrown). */
export async function fetchJSON<T>(path: string): Promise<T> {
  const r = await fetch(apiUrl(path));
  return (await r.json()) as T;
}

/* Tiny SWR-like fetch hook: in-memory cache + request de-duplication. */

const cache = new Map<string, { data: unknown; at: number }>();
const inflight = new Map<string, Promise<unknown>>();
const TTL = 10 * 60 * 1000;

export async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  let p = inflight.get(path) as Promise<T> | undefined;
  if (!p) {
    const load: Promise<T> = fetch(apiUrl(path)).then(async (r) => {
          const data = (await r.json()) as T & { error?: string };
          if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
          return data as T;
        });
    p = load
      .then((data) => {
        cache.set(path, { data, at: Date.now() });
        return data;
      })
      .finally(() => inflight.delete(path));
    inflight.set(path, p);
  }
  if (!signal) return p;
  return new Promise<T>((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    p!.then(resolve, reject);
  });
}

export function peekJSON<T>(path: string): T | undefined {
  return cache.get(path)?.data as T | undefined;
}

/**
 * `keep: true` keeps showing the previous result while a new path loads (e.g. search-as-you-type)
 * instead of flashing back to a skeleton.
 */
export function useApi<T>(
  path: string | null,
  opts: { keep?: boolean } = {},
): { data: T | undefined; error: string | null; loading: boolean; stale: boolean } {
  const [state, setState] = useState<{ path: string | null; data: T | undefined; error: string | null }>(() => ({
    path,
    data: path ? peekJSON<T>(path) : undefined,
    error: null,
  }));

  useEffect(() => {
    if (!path) return;
    const cached = peekJSON<T>(path);
    if (cached !== undefined || !opts.keep) setState({ path, data: cached, error: null });
    const ctrl = new AbortController();
    getJSON<T>(path, ctrl.signal)
      .then((data) => setState({ path, data, error: null }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ path, data: cached, error: e instanceof Error ? e.message : String(e) });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const current = state.path === path;
  const fresh = current ? state.data : path ? peekJSON<T>(path) : undefined;
  const data = fresh ?? (opts.keep && path ? state.data : undefined);
  return {
    data,
    error: current ? state.error : null,
    loading: !!path && (!current || (state.data === undefined && state.error === null)),
    stale: !!opts.keep && !current && data !== undefined,
  };
}
