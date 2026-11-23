"use client";

import { Play, Settings, Shuffle } from "lucide-react";
import Link from "next/link";
import { useRadio } from "@/components/radio/RadioProvider";
import { SongQueue } from "@/components/radio/SongQueue";
import { StationTile } from "@/components/radio/StationRow";
import { tx } from "@/lib/i18n";
import { useHydrated, useLibrary } from "@/store/library";

export default function ForYouPage() {
  const hydrated = useHydrated();
  const r = useRadio();
  const favs = useLibrary((s) => s.radioFavs);

  return (
    <div className="pb-4">
      <header className="flex items-center justify-between gap-3 px-4 pt-6 md:px-0 md:pt-8">
        <h1 className="whitespace-nowrap text-[28px] font-bold leading-tight tracking-tight md:text-[34px]">{tx("Сейчас в эфире")}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={r.next}
            disabled={!r.queue.length}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-fg px-4 text-[14px] font-semibold text-bg transition-opacity disabled:opacity-30"
          >
            {r.playing ? <Shuffle className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
            {r.playing ? tx("Дальше") : tx("Слушать")}
          </button>
          <Link href="/settings" className="flex h-10 w-10 items-center justify-center rounded-full bg-fg/[0.06] text-muted md:hidden" aria-label={tx("Настройки")}>
            <Settings className="h-[18px] w-[18px]" />
          </Link>
        </div>
      </header>

      <section className="mt-2">
        <p className="mb-3 px-4 text-[13px] text-subtle md:px-0">{tx("Песни, которые только что начались. Нажмите — и вы услышите её почти с начала.")}</p>
        <SongQueue />
      </section>

      {hydrated && favs.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 px-4 text-[20px] font-bold tracking-tight md:px-0">{tx("Мои станции")}</h2>
          <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:px-0">
            {favs.map((s) => (
              <StationTile key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
