import "server-only";
import { TTLCache } from "@/lib/ttl-cache";
import type { Station } from "./types";

/*
 * Radio Browser (https://www.radio-browser.info) — free, open community catalog of ~50k stations.
 * Mirrors are tried in order; the API asks for a descriptive User-Agent.
 */
const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
];
const UA = "vzMusic/1.0 (radio player)";
let preferred = 0;

type Raw = {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string;
  favicon: string;
  homepage: string;
  tags: string;
  country: string;
  countrycode: string;
  language: string;
  codec: string;
  bitrate: number;
  hls: number;
  votes: number;
  lastcheckok: number;
};

async function api<T>(path: string): Promise<T> {
  let lastErr: unknown;
  for (let k = 0; k < MIRRORS.length; k++) {
    const i = (preferred + k) % MIRRORS.length;
    try {
      const res = await fetch(`${MIRRORS[i]}${path}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      preferred = i;
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("radio-browser unavailable");
}

function toStation(r: Raw): Station | null {
  const url = (r.url_resolved || r.url || "").trim();
  // https only: an https page can't play http streams (mixed content)
  if (!url.startsWith("https://") || !r.lastcheckok) return null;
  return {
    id: r.stationuuid,
    name: r.name.trim().replace(/\s+/g, " "),
    url,
    favicon: r.favicon?.startsWith("https://") ? r.favicon : "",
    homepage: r.homepage ?? "",
    tags: (r.tags ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12),
    country: r.country ?? "",
    countrycode: r.countrycode ?? "",
    language: r.language ?? "",
    codec: r.codec ?? "",
    bitrate: r.bitrate ?? 0,
    hls: r.hls === 1 || /\.m3u8(\?|$)/i.test(url),
    votes: r.votes ?? 0,
  };
}

const cache = new TTLCache<Station[]>(30 * 60 * 1000, 500);

export async function searchStations(p: {
  q?: string;
  tag?: string;
  countrycode?: string;
  limit?: number;
}): Promise<Station[]> {
  const key = JSON.stringify(p);
  const hit = cache.get(key);
  if (hit) return hit;
  const qs = new URLSearchParams({
    hidebroken: "true",
    is_https: "true",
    order: "clickcount",
    reverse: "true",
    limit: String(Math.min(p.limit ?? 40, 150) * 2), // some get filtered out
  });
  if (p.q) qs.set("name", p.q);
  if (p.tag) {
    qs.set("tag", p.tag);
    qs.set("tagExact", "false");
  }
  if (p.countrycode) qs.set("countrycode", p.countrycode);
  const raw = await api<Raw[]>(`/json/stations/search?${qs}`);
  const seen = new Set<string>();
  const out = raw
    .map(toStation)
    .filter((s): s is Station => !!s)
    .filter((s) => {
      const k = s.name.toLowerCase();
      if (seen.has(k)) return false; // many duplicates of the same station
      seen.add(k);
      return true;
    })
    .slice(0, p.limit ?? 40);
  cache.set(key, out);
  return out;
}

const byId = new TTLCache<Station>(6 * 60 * 60 * 1000, 3000);

export async function stationsByIds(ids: string[]): Promise<Station[]> {
  const missing = ids.filter((id) => !byId.get(id));
  if (missing.length) {
    const raw = await api<Raw[]>(`/json/stations/byuuid?uuids=${missing.map(encodeURIComponent).join(",")}`);
    for (const r of raw) {
      const s = toStation(r);
      if (s) byId.set(s.id, s);
    }
  }
  return ids.map((id) => byId.get(id)).filter((s): s is Station => !!s);
}

/** Tells radio-browser a station was played (their popularity ranking; recommended by the API). */
export async function countClick(id: string): Promise<void> {
  await api(`/json/url/${encodeURIComponent(id)}`).catch(() => {});
}
