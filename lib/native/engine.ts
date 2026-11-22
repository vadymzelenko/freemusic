"use client";

/*
 * On-device YouTube engine for the iOS / Android app.
 *
 * Runs the very same youtubei.js logic as the server, but inside the app's WebView, with every
 * HTTP request going through Capacitor's NATIVE HTTP stack. Consequences:
 *   - no CORS (native requests aren't subject to it)
 *   - requests come from the phone's own IP → no "confirm you're not a bot", no cookie needed
 *   - stream URLs are issued for the phone's IP, so <audio> plays them directly from Google
 *
 * Loaded lazily (see platform.ts) — the website never downloads this code.
 */

import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Innertube } from "youtubei.js";
import type { Types } from "youtubei.js";
import { getLyrics } from "@/lib/lyrics";
import {
  getAlbumPage,
  getArtistPage,
  getArtistSongs,
  mixPools,
  popularArtists,
  search,
  suggest,
  type SearchType,
} from "@/lib/yt-browse";
import {
  clientOrder,
  configureYT,
  getAudioSource,
  getYT,
  invalidateAudioSource,
  peekAudioSource,
  relatedTracks,
  resetYoutubeBlock,
  resolveWithClient,
} from "@/lib/yt-core";

/* ------------------------------------------------------------------ */
/* Native fetch                                                        */
/* ------------------------------------------------------------------ */

function headersToRecord(...sources: (HeadersInit | undefined)[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const src of sources) {
    if (!src) continue;
    new Headers(src).forEach((v, k) => {
      out[k] = v;
    });
  }
  return out;
}

async function bodyToString(body: unknown): Promise<string | undefined> {
  if (body == null) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(body as ArrayBuffer);
  }
  if (body instanceof Blob) return body.text();
  if (body instanceof ReadableStream) return new Response(body).text();
  return String(body);
}

/** fetch() implemented on top of the native HTTP stack (no CORS, phone's own IP). */
export async function nativeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = input instanceof Request ? input : undefined;
  const url = req ? req.url : input instanceof URL ? input.href : String(input);
  const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
  // init.headers is a standalone Headers object → it still carries User-Agent etc.
  const headers = headersToRecord(req?.headers, init?.headers);
  const data = await bodyToString(init?.body ?? (req && method !== "GET" && method !== "HEAD" ? await req.clone().text() : undefined));

  const res = await CapacitorHttp.request({
    url,
    method,
    headers,
    data,
    responseType: "text",
    disableRedirects: init?.redirect === "manual",
  });
  const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
  const response = new Response(method === "HEAD" || res.status === 204 || res.status === 304 ? null : text, {
    status: res.status,
    headers: res.headers as Record<string, string>,
  });
  Object.defineProperty(response, "url", { value: res.url || url });
  return response;
}

/* ------------------------------------------------------------------ */
/* Innertube on the device                                             */
/* ------------------------------------------------------------------ */

const SESSION_TTL = 6 * 60 * 60 * 1000;
let full: { p: Promise<Innertube>; at: number } | null = null;

function createFull(): Promise<Innertube> {
  if (!full || Date.now() - full.at > SESSION_TTL) {
    const p = Innertube.create({
      fetch: nativeFetch as typeof fetch,
      retrieve_player: true,
      generate_session_locally: false,
      enable_session_cache: false,
      lang: "en",
      location: "US",
    }).catch((e: unknown) => {
      full = null;
      throw e;
    });
    full = { p, at: Date.now() };
  }
  return full.p;
}

// Residential / mobile IP → the simple clients work without cookies or PO tokens.
const DEVICE_CLIENTS: Types.InnerTubeClient[] = ["IOS", "ANDROID_VR", "TV", "WEB_EMBEDDED", "MWEB"];

configureYT({
  full: createFull,
  browse: createFull,
  fetch: nativeFetch as typeof fetch,
  clients: () => DEVICE_CLIENTS,
});

/* ------------------------------------------------------------------ */
/* API router — same paths and JSON shapes as the server routes        */
/* ------------------------------------------------------------------ */

const list = (v: string | null) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export async function route(path: string): Promise<unknown> {
  const u = new URL(path, "https://local.invalid");
  const p = u.searchParams;
  const id = p.get("id") ?? "";
  switch (u.pathname) {
    case "/api/search": {
      const type = (["all", "song", "album", "artist"].includes(p.get("type") ?? "") ? p.get("type") : "song") as SearchType;
      const res = await search(p.get("q") ?? "", type);
      return { ...res, tracks: res.songs };
    }
    case "/api/suggest":
      return suggest(p.get("q") ?? "");
    case "/api/artist":
      return getArtistPage(id);
    case "/api/artist/songs":
      return getArtistSongs(id);
    case "/api/album":
      return getAlbumPage(id);
    case "/api/related":
      return { tracks: await relatedTracks(id) };
    case "/api/mix":
      return { pools: await mixPools(list(p.get("a")), list(p.get("t"))) };
    case "/api/artists/popular":
      return { genres: await popularArtists() };
    case "/api/lyrics":
      return getLyrics({
        id,
        title: p.get("title") ?? "",
        artist: p.get("artist") ?? "",
        album: p.get("album") || undefined,
        duration: Number(p.get("duration")) || 0,
      });
    case "/api/prepare": {
      try {
        const src = await getAudioSource(id);
        return { ok: true, id, mimeType: src.mimeType, itag: src.itag, durationMs: src.durationMs, client: src.client };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    case "/api/warm":
      await createFull();
      return { ok: true };
    case "/api/debug":
      return debug(id || "CD-E-LDc384");
    default:
      throw new Error(`Unknown native route ${u.pathname}`);
  }
}

async function debug(id: string) {
  resetYoutubeBlock();
  let session: unknown;
  try {
    const yt = await getYT();
    session = { ok: true, player_id: yt.session.player?.player_id ?? null };
  } catch (e) {
    session = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const results = [];
  for (const client of clientOrder()) {
    const t0 = Date.now();
    try {
      const src = await resolveWithClient(id, client);
      results.push({ client, ok: true, ms: Date.now() - t0, mime: src.mimeType, itag: src.itag });
    } catch (e) {
      results.push({ client, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { id, mode: `native-${Capacitor.getPlatform()}`, session, results };
}

/* ------------------------------------------------------------------ */
/* Streams                                                             */
/* ------------------------------------------------------------------ */

/** Already-resolved googlevideo URL (sync) — lets the player switch tracks without awaiting. */
export function peekStreamUrl(id: string): string | undefined {
  return peekAudioSource(id)?.url;
}

export async function resolveStreamUrl(id: string, fresh = false): Promise<string> {
  if (fresh) invalidateAudioSource(id);
  return (await getAudioSource(id, { fresh, verify: fresh })).url;
}

/* ------------------------------------------------------------------ */
/* Files: downloads ("dl") and the short-term buffer ("recent")        */
/* ------------------------------------------------------------------ */

export type FileKind = "dl" | "recent";
let baseUri = "";

const relPath = (id: string, kind: FileKind) => `vz/${kind}/${id}.m4a`;

/** Must be awaited once on startup so fileSrc() can be synchronous. */
export async function initFiles(): Promise<void> {
  if (baseUri) return;
  const r = await Filesystem.getUri({ path: "", directory: Directory.Data });
  baseUri = r.uri.replace(/\/$/, "");
}

/** URL the WebView can play for a stored file (synchronous). */
export function fileSrc(id: string, kind: FileKind): string {
  return Capacitor.convertFileSrc(`${baseUri}/${relPath(id, kind)}`);
}

/** Downloads a track natively into the app's storage. Returns its size in bytes. */
export async function downloadToFile(id: string, kind: FileKind, onProgress?: (p: number) => void): Promise<number> {
  await initFiles();
  const url = await resolveStreamUrl(id);
  const handle = onProgress
    ? await Filesystem.addListener("progress", (e) => {
        if (e.url === url && e.contentLength > 0) onProgress(Math.min(0.99, e.bytes / e.contentLength));
      })
    : null;
  try {
    await Filesystem.downloadFile({
      url,
      path: relPath(id, kind),
      directory: Directory.Data,
      recursive: true,
      progress: !!onProgress,
    });
  } catch (e) {
    // URL may have expired / been refused — resolve again once.
    const retry = await resolveStreamUrl(id, true);
    await Filesystem.downloadFile({ url: retry, path: relPath(id, kind), directory: Directory.Data, recursive: true });
    void e;
  } finally {
    void handle?.remove();
  }
  const st = await Filesystem.stat({ path: relPath(id, kind), directory: Directory.Data });
  if (!st.size) throw new Error("Empty file");
  return st.size;
}

export async function deleteFile(id: string, kind: FileKind): Promise<void> {
  try {
    await Filesystem.deleteFile({ path: relPath(id, kind), directory: Directory.Data });
  } catch {
    /* already gone */
  }
}

export async function listFiles(kind: FileKind): Promise<string[]> {
  try {
    const r = await Filesystem.readdir({ path: `vz/${kind}`, directory: Directory.Data });
    return r.files.map((f) => f.name.replace(/\.m4a$/, ""));
  } catch {
    return [];
  }
}

/** Index of downloads for the offline screen (native-shell/offline.html). */
export async function writeOfflineIndex(items: { id: string; title: string; artist: string; cover: string }[]) {
  try {
    await Filesystem.writeFile({
      path: "vz/index.json",
      directory: Directory.Data,
      data: JSON.stringify(items),
      encoding: Encoding.UTF8,
      recursive: true,
    });
  } catch {
    /* ignore */
  }
}
