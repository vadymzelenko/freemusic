"use client";

import { tx } from "@/lib/i18n";
import { Check, Download, Loader2 } from "lucide-react";
import { tracksWord } from "@/lib/plural";
import { downloadTracks } from "@/lib/downloads";
import type { Track } from "@/lib/types";
import { useDownloads } from "@/store/downloads";
import { useUI } from "@/store/ui";

export function DownloadAllButton({ tracks }: { tracks: Track[] }) {
  const toast = useUI((s) => s.showToast);
  const done = useDownloads((s) => tracks.filter((t) => s.items[t.id]).length);
  const busy = useDownloads((s) => tracks.filter((t) => s.active[t.id] && s.active[t.id]!.state !== "error").length);
  const all = tracks.length > 0 && done === tracks.length;
  return (
    <button
      type="button"
      disabled={!tracks.length || all}
      onClick={() => {
        const n = downloadTracks(tracks);
        toast(n ? tx("Скачиваем: {n}", { n: tracksWord(n) }) : tx("Уже скачано"));
      }}
      className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-[13px] font-medium disabled:opacity-60"
      aria-label={tx("Скачать всё")}
    >
      {all ? (
        <Check className="h-4 w-4" />
      ) : busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {busy ? `${done}/${tracks.length}` : all ? tx("Скачано") : ""}
    </button>
  );
}

