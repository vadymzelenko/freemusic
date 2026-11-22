import "server-only";
import { Innertube, ProtoUtils, UniversalCache } from "youtubei.js";
import type { Types } from "youtubei.js";
import { configureYT } from "./yt-core";

export * from "./yt-core";

/* Server (Vercel / home bridge) flavour: Node fetch, optional YT_COOKIE, cached sessions. */

const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // player JS rotates — refresh periodically

type GlobalYT = { promise: Promise<Innertube>; createdAt: number } | undefined;
const g = globalThis as unknown as { __yt?: GlobalYT; __ytBrowse?: GlobalYT };

export function hasVisitorIdInCookie(): boolean {
  return /(?:^|;\s*)VISITOR_INFO1_LIVE=/.test(process.env.YT_COOKIE ?? "");
}

function createInnertube(withPlayer: boolean): Promise<Innertube> {
  const cookie = process.env.YT_COOKIE?.trim() || undefined;
  const visitorId = cookie ? /(?:^|;\s*)VISITOR_INFO1_LIVE=([^;]+)/.exec(cookie)?.[1] : undefined;
  return Innertube.create({
    cookie,
    // The visitor id must match the logged-in cookie, otherwise YouTube answers
    // "UNPLAYABLE: The page needs to be reloaded".
    visitor_data: visitorId ? ProtoUtils.encodeVisitorData(visitorId, Math.floor(Date.now() / 1000)) : undefined,
    // Downloading + parsing the player JS is the slowest part of a cold start; only streams need it.
    retrieve_player: withPlayer,
    generate_session_locally: !cookie,
    enable_session_cache: false,
    cache: new UniversalCache(false),
    lang: "en",
    location: process.env.YT_LOCATION || "US",
  });
}

function memo(key: "__yt" | "__ytBrowse", withPlayer: boolean): Promise<Innertube> {
  const now = Date.now();
  const cur = g[key];
  if (!cur || now - cur.createdAt > SESSION_TTL_MS) {
    const promise = createInnertube(withPlayer).catch((err: unknown) => {
      g[key] = undefined; // don't memoize failures
      throw err;
    });
    g[key] = { promise, createdAt: now };
  }
  return g[key]!.promise;
}

// Without a cookie the mobile/VR clients are the most permissive; with a cookie the
// TV/web clients use the logged-in session (ANDROID_VR/IOS ignore cookies).
const DEFAULT_CLIENTS: Types.InnerTubeClient[] = ["ANDROID_VR", "IOS", "TV", "WEB_EMBEDDED", "MWEB", "TV_EMBEDDED"];
// ANDROID_VR / IOS reject authenticated requests (HTTP 400), so they're not used with a cookie.
const COOKIE_CLIENTS: Types.InnerTubeClient[] = ["TV", "TV_SIMPLY", "WEB", "YTMUSIC", "MWEB", "WEB_EMBEDDED"];

configureYT({
  full: () => memo("__yt", true),
  browse: () => {
    // If the full client is already up, reuse it.
    if (g.__yt && Date.now() - g.__yt.createdAt <= SESSION_TTL_MS) return g.__yt.promise;
    return memo("__ytBrowse", false);
  },
  fetch: (input, init) => fetch(input, init),
  clients: () => {
    const env = process.env.YT_CLIENTS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (env?.length) return env as Types.InnerTubeClient[];
    return process.env.YT_COOKIE ? COOKIE_CLIENTS : DEFAULT_CLIENTS;
  },
});
