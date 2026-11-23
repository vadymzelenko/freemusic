"use client";

import { Cover } from "@/components/ui/Cover";
import type { Track } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** Cover for a song heard on air: stored cover, or looked up on Deezer when it scrolls in. */
export function SongCover({ track, className, rounded }: { track: Pick<Track, "artist" | "title" | "cover">; className?: string; rounded?: string }) {
  const meta = useApi<{ track: { cover: string } | null }>(
    track.cover ? null : `/api/meta/track?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}`,
  );
  return <Cover src={track.cover || meta.data?.track?.cover} alt="" className={className} rounded={rounded} />;
}
