import { stationsByIds } from "@/lib/radio/browser";
import { readIcyTitle } from "@/lib/radio/icy";
import { splitStreamTitle, type NowPlaying } from "@/lib/radio/types";
import { TTLCache } from "@/lib/ttl-cache";
import { cachedJson, json, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const cache = new TTLCache<NowPlaying | null>(15_000, 5000);

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/** ?ids=uuid,uuid,… (≤80) → { items: { [id]: { artist, title, raw } | null } } */
export const GET = cachedJson("radio-nowplaying", "no-store", async (p) => {
  const ids = (p.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, 80);
  if (!ids.length) return json({ error: "ids required" }, { status: 400 });

  const stations = await stationsByIds(ids);
  const items: Record<string, NowPlaying | null> = {};
  await pool(stations, 20, async (s) => {
    const hit = cache.get(s.id);
    if (hit !== undefined) {
      items[s.id] = hit;
      return;
    }
    // HLS streams carry titles in segments (ID3), not ICY — skipped for now
    const raw = s.hls ? null : await readIcyTitle(s.url, 4500);
    const np = raw && !/^(?:-|unknown|n\/a)$/i.test(raw.trim()) ? splitStreamTitle(raw) : null;
    cache.set(s.id, np);
    items[s.id] = np;
  });
  return { items, at: Date.now() };
});

export const OPTIONS = preflight;
