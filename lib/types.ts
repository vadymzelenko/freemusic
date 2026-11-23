export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  /** Duration in seconds (0 when unknown). */
  duration: number;
  /** Cover art URL ("" = look it up on demand). */
  cover: string;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

/** Artist the user picked in onboarding or followed. `key` = normalized name. */
export interface FollowedArtist {
  key: string;
  id?: string;
  name: string;
  thumbnail?: string;
  addedAt: number;
}

export interface PlayEvent {
  /** track id */
  t: string;
  /** artist key */
  a: string;
  /** timestamp ms */
  at: number;
  /** seconds listened */
  s: number;
  /** completed */
  c: boolean;
  /** skipped early */
  k: boolean;
}

/** Normalized artist identity used for affinity scoring. */
export function artistKey(name: string): string {
  return (name.split(/,|&| feat\.? | ft\.? | x /i)[0] ?? name).trim().toLowerCase();
}
