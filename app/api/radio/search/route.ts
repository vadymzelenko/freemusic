import { searchStations, type StationOrder } from "@/lib/radio/browser";
import { cachedJson, preflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORDERS: StationOrder[] = ["clickcount", "votes", "clicktrend", "name"];

/** ?q=name&tag=rock&cc=PL&lang=polish&order=votes&offset=0&limit=40 */
export const GET = cachedJson("radio-search", "public, s-maxage=1800, stale-while-revalidate=86400", async (p) => {
  const paged = p.has("offset");
  const offset = Math.max(0, Number(p.get("offset")) || 0);
  const limit = Math.min(Number(p.get("limit")) || 40, 100);
  const stations = await searchStations({
    q: p.get("q")?.trim().slice(0, 80) || undefined,
    tag: p.get("tag")?.trim().slice(0, 40) || undefined,
    countrycode: p.get("cc")?.trim().toUpperCase().slice(0, 2) || undefined,
    language: p.get("lang")?.trim().toLowerCase().slice(0, 40) || undefined,
    order: ORDERS.includes(p.get("order") as StationOrder) ? (p.get("order") as StationOrder) : "clickcount",
    offset,
    limit,
    paged,
  });
  // `next` = offset of the next catalog page (raw rows; some are filtered as broken / http / duplicates)
  return { stations, next: paged ? offset + limit : null };
});

export const OPTIONS = preflight;
