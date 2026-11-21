export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  /** Duration in seconds (0 when unknown). */
  duration: number;
  /** High resolution cover (544x544 when available). */
  cover: string;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

export interface AlbumSummary {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  year?: string;
  cover: string;
  kind?: string;
}

export interface ArtistSummary {
  id: string;
  name: string;
  thumbnail: string;
  subtitle?: string;
}

export interface ArtistPage extends ArtistSummary {
  description?: string;
  songs: Track[];
  albums: AlbumSummary[];
  singles: AlbumSummary[];
  related: ArtistSummary[];
}

export interface AlbumPage extends AlbumSummary {
  tracks: Track[];
}

export interface SearchResults {
  songs: Track[];
  albums: AlbumSummary[];
  artists: ArtistSummary[];
}

export interface Suggestions {
  queries: string[];
  songs: Track[];
  artists: ArtistSummary[];
  albums: AlbumSummary[];
}

export interface MixPool {
  kind: "artist" | "track";
  seedId: string;
  seedName: string;
  cover: string;
  tracks: Track[];
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
