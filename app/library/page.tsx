"use client";

import { ChevronRight, Heart, ListMusic, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AccountCard } from "@/components/AccountCard";
import { PageHeader } from "@/components/PageHeader";
import { Cover } from "@/components/ui/Cover";
import { Sheet } from "@/components/ui/Sheet";
import { useHydrated, useLibrary } from "@/store/library";

function Mosaic({ covers }: { covers: string[] }) {
  if (covers.length === 0) {
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-line bg-bg text-muted">
        <ListMusic className="h-6 w-6" />
      </div>
    );
  }
  if (covers.length < 4) return <Cover src={covers[0]} alt="" className="h-14 w-14" rounded="rounded-lg" />;
  return (
    <div className="grid h-14 w-14 grid-cols-2 overflow-hidden rounded-lg">
      {covers.slice(0, 4).map((c, i) => (
        <Cover key={i} src={c} alt="" className="h-7 w-7" rounded="rounded-none" />
      ))}
    </div>
  );
}

export default function LibraryPage() {
  const hydrated = useHydrated();
  const likedCount = useLibrary((s) => s.likedIds.length);
  const playlists = useLibrary((s) => s.playlists);
  const tracks = useLibrary((s) => s.tracks);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  return (
    <div>
      <PageHeader title="Медиатека">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-[13px] font-medium text-fg/90 active:bg-white/10"
        >
          <Plus className="h-4 w-4" /> Плейлист
        </button>
      </PageHeader>

      <AccountCard />

      <div className="space-y-1 px-2 pt-3">
        <Link
          href="/library/liked"
          className="flex items-center gap-4 rounded-xl px-2 py-2 active:bg-white/[0.04] md:hover:bg-white/[0.03]"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-200 to-zinc-500">
            <Heart className="h-6 w-6 fill-bg text-bg" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium">Любимые треки</div>
            <div className="text-[13px] text-muted">{hydrated ? `${likedCount} треков` : " "}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-subtle" />
        </Link>

        {!hydrated ? (
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-2 py-2">
              <div className="skeleton h-14 w-14 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3.5 w-1/2 rounded" />
                <div className="skeleton h-3 w-1/4 rounded" />
              </div>
            </div>
          ))
        ) : (
          playlists.map((p) => (
            <Link
              key={p.id}
              href={`/library/${p.id}`}
              className="flex items-center gap-4 rounded-xl px-2 py-2 active:bg-white/[0.04] md:hover:bg-white/[0.03]"
            >
              <Mosaic covers={p.trackIds.map((id) => tracks[id]?.cover).filter((c): c is string => !!c)} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{p.name}</div>
                <div className="text-[13px] text-muted">{p.trackIds.length} треков</div>
              </div>
              <ChevronRight className="h-4 w-4 text-subtle" />
            </Link>
          ))
        )}

        {hydrated && playlists.length === 0 && (
          <p className="px-2 pt-6 text-center text-sm text-subtle">
            Создайте плейлист или добавьте трек через меню «…».
          </p>
        )}
      </div>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title={<div className="text-[15px] font-semibold">Новый плейлист</div>}
      >
        <form
          className="flex gap-2 px-5 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createPlaylist(name);
            setName("");
            setCreating(false);
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название"
            className="h-11 flex-1 rounded-lg border border-line bg-bg px-3 text-[16px] outline-none placeholder:text-subtle focus:border-line-strong"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="h-11 rounded-lg bg-fg px-4 text-sm font-medium text-bg disabled:opacity-30"
          >
            Создать
          </button>
        </form>
      </Sheet>
    </div>
  );
}
