"use client";

import { useEffect, useRef, useState } from "react";
import { Cover } from "@/components/ui/Cover";
import type { Track } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** Cover for a song heard on air: stored cover, or looked up on Deezer once it scrolls into view. */
export function SongCover({ track, className, rounded }: { track: Pick<Track, "artist" | "title" | "cover">; className?: string; rounded?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSeen(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  const meta = useApi<{ track: { cover: string } | null }>(
    track.cover || !seen || !track.title ? null : `/api/meta/track?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}`,
  );
  return (
    <div ref={ref} className="shrink-0">
      <Cover src={track.cover || meta.data?.track?.cover} alt="" className={className} rounded={rounded} />
    </div>
  );
}
