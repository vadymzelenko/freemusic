export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const STREAM_BASE = (process.env.NEXT_PUBLIC_STREAM_API_URL ?? "").replace(/\/+$/, "");

/** Predictable stream URL — computed synchronously, no network round-trip needed. */
export function streamUrl(id: string): string {
  return `${STREAM_BASE}/api/stream?id=${encodeURIComponent(id)}`;
}

export function prepareUrl(id: string): string {
  return `${STREAM_BASE}/api/prepare?id=${encodeURIComponent(id)}`;
}

export function apiUrl(path: string): string {
  return `${STREAM_BASE}${path}`;
}
