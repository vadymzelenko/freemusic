export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
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
