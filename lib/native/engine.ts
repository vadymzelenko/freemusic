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
import { Constants, Innertube } from "youtubei.js";
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
  STREAM_FETCH_HEADERS,
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
// ANDROID_VR first: its stream URLs need no PO token and play in any WebView.
const DEVICE_CLIENTS: Types.InnerTubeClient[] = ["ANDROID_VR", "IOS", "TV", "WEB_EMBEDDED", "MWEB"];

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
        const src = await getAudioSource(id, { verify: true });
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
  // End-to-end: resolve like the player does and really try to play it, plus a native download.
  let playback: unknown;
  try {
    invalidateAudioSource(id);
    const src = await getAudioSource(id, { verify: true });
    const direct = await canPlay(src.url);
    // This is the path the app's player uses.
    let file: string;
    try {
      await deleteFile(id, "recent");
      const t0 = Date.now();
      const bytes = await downloadToFile(id, "recent");
      file = `downloaded ${Math.round(bytes / 1024)} KB in ${Date.now() - t0} ms → ${await canPlay(fileSrc(id, "recent"))}`;
    } catch (e) {
      file = `download failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}`;
    }
    let strategy = "";
    try {
      strategy = JSON.stringify(loadWinner());
    } catch {
      /* ignore */
    }
    playback = { client: src.client, itag: src.itag, direct, file, strategy, matrix: (await downloadMatrix(id)).join("\n") };
  } catch (e) {
    playback = { error: e instanceof Error ? e.message : String(e) };
  }
  return { id, mode: `native-${Capacitor.getPlatform()}`, session, playback, results };
}

/* ------------------------------------------------------------------ */
/* Streams                                                             */
/* ------------------------------------------------------------------ */

/** Already-resolved googlevideo URL (sync) — lets the player switch tracks without awaiting. */
export function peekStreamUrl(id: string): string | undefined {
  return peekAudioSource(id)?.url;
}

/** Always verified on the device (one tiny request) — an unplayable URL is worse than a slow one. */
export async function resolveStreamUrl(id: string, fresh = false): Promise<string> {
  if (fresh) invalidateAudioSource(id);
  return (await getAudioSource(id, { fresh, verify: true })).url;
}

/** Tries to actually play a URL in the WebView's media stack (used by diagnostics). */
function canPlay(url: string, timeoutMs = 12000): Promise<string> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "auto";
    a.muted = true;
    const done = (r: string) => {
      clearTimeout(t);
      a.removeAttribute("src");
      a.load();
      resolve(r);
    };
    const t = setTimeout(() => done("timeout"), timeoutMs);
    a.oncanplay = () => done(`ok (${Math.round(a.duration)}s)`);
    a.onerror = () => done(`error ${a.error?.code ?? "?"} ${a.error?.message ?? ""}`.trim());
    a.src = url;
    a.load();
  });
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

/* ---------- adaptive downloader ----------
 * googlevideo is picky about who downloads what. We try combinations of
 *   client (whose URL) × User-Agent × chunk size
 * on the first chunk, remember the winner, and fetch the rest of the file with it.
 */

type UaKind = "client" | "native" | "safari";
interface Strategy {
  client: Types.InnerTubeClient;
  ua: UaKind;
  chunk: number;
}

const STRATEGY_KEY = "vz-download-strategy";
const DL_CLIENTS: Types.InnerTubeClient[] = ["ANDROID_VR", "IOS"];
const UAS: UaKind[] = ["client", "native", "safari"];
const CHUNKS = [1024 * 1024, 256 * 1024];

function allStrategies(): Strategy[] {
  const out: Strategy[] = [];
  for (const chunk of CHUNKS) for (const client of DL_CLIENTS) for (const ua of UAS) out.push({ client, ua, chunk });
  return out;
}

function loadWinner(): Strategy | null {
  try {
    return JSON.parse(localStorage.getItem(STRATEGY_KEY) ?? "null") as Strategy | null;
  } catch {
    return null;
  }
}
function saveWinner(st: Strategy | null) {
  try {
    if (st) localStorage.setItem(STRATEGY_KEY, JSON.stringify(st));
    else localStorage.removeItem(STRATEGY_KEY);
  } catch {
    /* ignore */
  }
}

function headersFor(client: Types.InnerTubeClient, ua: UaKind): Record<string, string> {
  if (ua === "safari") return { ...STREAM_FETCH_HEADERS };
  if (ua === "native") return { accept: "*/*" };
  const clients = Constants.CLIENTS as unknown as Record<string, { USER_AGENT?: string }>;
  const agent = clients[client]?.USER_AGENT;
  return agent ? { accept: "*/*", "user-agent": agent } : { accept: "*/*" };
}

/** One ranged request through the native HTTP stack. Returns base64 data on success. */
async function rangeReq(url: string, start: number, end: number, headers: Record<string, string>) {
  const res = await CapacitorHttp.request({
    url: `${url}&range=${start}-${end}`,
    method: "GET",
    headers,
    responseType: "blob",
    connectTimeout: 15000,
    readTimeout: 30000,
  });
  const ok = res.status >= 200 && res.status < 300 && typeof res.data === "string";
  const b64 = ok ? (res.data as string).replace(/^data:[^,]*,/, "") : "";
  return { status: res.status, b64, bytes: Math.floor((b64.length * 3) / 4) };
}

async function urlFor(id: string, client: Types.InnerTubeClient, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(client);
  if (hit) return hit;
  const url = (await resolveWithClient(id, client, false)).url;
  cache.set(client, url);
  return url;
}

/**
 * Downloads a track natively into the app's storage (ranged requests, ≤1 MB each).
 * Returns its size in bytes.
 */
export async function downloadToFile(id: string, kind: FileKind, onProgress?: (p: number) => void): Promise<number> {
  await initFiles();
  const path = relPath(id, kind);
  const urls = new Map<string, string>();
  const winner = loadWinner();
  const order = winner ? [winner, ...allStrategies().filter((x) => JSON.stringify(x) !== JSON.stringify(winner))] : allStrategies();

  const errors: string[] = [];
  for (const st of order) {
    let url: string;
    try {
      url = await urlFor(id, st.client, urls);
    } catch (e) {
      errors.push(`${st.client}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const total = Number(new URL(url).searchParams.get("clen")) || 0;
    const headers = headersFor(st.client, st.ua);
    const first = await rangeReq(url, 0, Math.min(st.chunk, total || st.chunk) - 1, headers).catch(() => null);
    if (!first || !first.b64) {
      errors.push(`${st.client}/${st.ua}/${st.chunk >> 10}K: ${first?.status ?? "net"}`);
      continue;
    }
    // This combination works — fetch the rest with it.
    await deleteFile(id, kind);
    await Filesystem.writeFile({ path, directory: Directory.Data, data: first.b64, recursive: true });
    let pos = first.bytes;
    let failed = false;
    while (total && pos < total) {
      const end = Math.min(total - 1, pos + st.chunk - 1);
      let part = await rangeReq(url, pos, end, headers).catch(() => null);
      if (!part?.b64) part = await rangeReq(url, pos, end, headers).catch(() => null); // one retry
      if (!part?.b64) {
        errors.push(`${st.client}/${st.ua}: chunk @${pos} → ${part?.status ?? "net"}`);
        failed = true;
        break;
      }
      await Filesystem.appendFile({ path, directory: Directory.Data, data: part.b64 });
      pos += part.bytes;
      onProgress?.(Math.min(0.99, pos / total));
    }
    if (failed) continue;
    const size = (await Filesystem.stat({ path, directory: Directory.Data })).size;
    if (size < 40_000 || (total && size < total * 0.98)) {
      errors.push(`${st.client}/${st.ua}: short file ${size}/${total}`);
      continue;
    }
    saveWinner(st);
    return size;
  }
  saveWinner(null);
  await deleteFile(id, kind);
  throw new Error(`googlevideo refused all download variants: ${errors.slice(0, 6).join(" | ")}`);
}

/** Diagnostics: HTTP status of googlevideo for every combination (1 KB and 1 MB ranges). */
async function downloadMatrix(id: string): Promise<string[]> {
  const urls = new Map<string, string>();
  const lines: string[] = [];
  for (const client of DL_CLIENTS) {
    let url: string;
    try {
      url = await urlFor(id, client, urls);
    } catch (e) {
      lines.push(`${client}: resolve failed — ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const ua of UAS) {
      const h = headersFor(client, ua);
      const small = await rangeReq(url, 0, 1023, h).catch(() => null);
      const big = await rangeReq(url, 0, 1024 * 1024 - 1, h).catch(() => null);
      lines.push(`${client} · ua=${ua}: 1KB→${small?.status ?? "net"} 1MB→${big?.status ?? "net"}`);
    }
  }
  return lines;
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
