/* FreeMusic service worker.
 *
 * - /offline/audio?id=…  → downloaded track from Cache Storage, with proper Range/206 support
 *                          (required by iOS Safari for <audio>). Falls back to the network stream.
 * - page navigations     → network first, cached copy when offline
 * - /_next/static/*      → cache first (immutable build assets)
 * - cover images         → served from cache when the track was downloaded
 * - /api/*               → never touched (live streaming stays on the network path)
 */

const VERSION = "v1";
const AUDIO_CACHE = "freemusic-audio-v1";
const COVER_CACHE = "freemusic-covers-v1";
const SHELL_CACHE = `freemusic-shell-${VERSION}`;
const STATIC_CACHE = `freemusic-static-${VERSION}`;
const SHELL_URLS = ["/", "/search", "/library", "/library/downloads", "/queue", "/settings"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => Promise.allSettled(SHELL_URLS.map((u) => c.add(new Request(u, { cache: "reload" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([AUDIO_CACHE, COVER_CACHE, SHELL_CACHE, STATIC_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || "");
  if (!m) return null;
  let start;
  let end;
  if (m[1] === "") {
    const n = parseInt(m[2], 10);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === "" ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
  }
  if (Number.isNaN(start) || start >= size || start > end) return { invalid: true };
  return { start, end };
}

async function serveOfflineAudio(request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(`/offline/audio?id=${encodeURIComponent(id)}`);
  if (!cached) {
    // Evicted or never stored — stream it instead.
    const headers = new Headers();
    const range = request.headers.get("range");
    if (range) headers.set("Range", range);
    return fetch(`/api/stream?id=${encodeURIComponent(id)}`, { headers });
  }

  const blob = await cached.blob();
  const type = cached.headers.get("content-type") || "audio/mp4";
  const size = blob.size;
  const range = parseRange(request.headers.get("range"), size);

  if (!range) {
    return new Response(blob, {
      status: 200,
      headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes" },
    });
  }
  if (range.invalid) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const part = blob.slice(range.start, range.end + 1, type);
  return new Response(part, {
    status: 206,
    headers: {
      "Content-Type": type,
      "Content-Length": String(part.size),
      "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok && res.type === "basic") cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(request, { ignoreSearch: true })) || (await cache.match("/library/downloads"));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function coverFromCache(request) {
  const cache = await caches.open(COVER_CACHE);
  const hit = await cache.match(request.url);
  if (hit) return hit;
  return fetch(request);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname === "/offline/audio") {
      event.respondWith(serveOfflineAudio(request));
      return;
    }
    if (url.pathname.startsWith("/api/")) return; // live network, untouched
    if (url.pathname.startsWith("/_next/static/")) {
      event.respondWith(cacheFirst(request, STATIC_CACHE));
      return;
    }
    if (request.mode === "navigate") {
      event.respondWith(networkFirst(request));
      return;
    }
    return;
  }

  if (request.destination === "image" && /googleusercontent\.com|ggpht\.com|ytimg\.com/.test(url.hostname)) {
    event.respondWith(coverFromCache(request));
  }
});
