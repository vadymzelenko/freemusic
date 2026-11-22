export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Home server (e.g. Banana Pi via Tailscale Funnel). Empty = this site's own API routes. */
const HOME_BASE = (process.env.NEXT_PUBLIC_STREAM_API_URL ?? "").replace(/\/+$/, "");

/** Current API base — falls back to the site itself while the home server is unreachable. */
let apiBase = HOME_BASE;

export function currentApiBase(): string {
  return apiBase;
}

/**
 * Checks the home server once at startup (and when the app returns to the foreground);
 * if it doesn't answer within 4 s, everything goes to the site's own /api until it's back.
 */
export async function checkApiBase(): Promise<string> {
  if (!HOME_BASE || typeof window === "undefined") return apiBase;
  try {
    const r = await fetch(`${HOME_BASE}/api/warm`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    apiBase = r.ok ? HOME_BASE : "";
  } catch {
    apiBase = "";
  }
  return apiBase;
}

/** Predictable stream URL — computed synchronously, no network round-trip needed. */
export function streamUrl(id: string): string {
  return `${apiBase}/api/stream?id=${encodeURIComponent(id)}`;
}

export function prepareUrl(id: string): string {
  return `${apiBase}/api/prepare?id=${encodeURIComponent(id)}`;
}

export function apiUrl(path: string): string {
  return `${apiBase}${path}`;
}
