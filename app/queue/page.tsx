"use client";

import { tx } from "@/lib/i18n";
import { ListMusic, Loader2, Radio, X } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { TrackRow } from "@/components/TrackRow";
import { TrackRowSkeleton } from "@/components/ui/Skeleton";
import { usePlayer } from "@/components/player/PlayerProvider";
import { cn } from "@/lib/cn";

export default function QueuePage() {
  const { queue, index, current, jumpTo, removeFromQueue, clearUpcoming, radio, setRadio, radioLoading } =
    usePlayer();
  const upcoming = queue.slice(index + 1);
  const history = queue.slice(0, index);

  return (
    <div>
      <PageHeader title={tx("Очередь")}>
        <button
          type="button"
          onClick={() => setRadio(!radio)}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
            radio ? "border-fg bg-fg text-bg" : "border-line bg-card text-muted",
          )}
          aria-pressed={radio}
        >
          <Radio className="h-4 w-4" />{tx(" Радио")}
        </button>
      </PageHeader>

      {!current ? (
        <div className="mt-16 flex flex-col items-center px-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-card">
            <ListMusic className="h-6 w-6 text-muted" />
          </div>
          <p className="text-[15px] font-medium">{tx("Очередь пуста")}</p>
          <p className="mt-1 text-sm text-subtle">
            <Link href="/" className="underline underline-offset-4">
              {tx("Найдите трек")}
            </Link>
            {tx(", и радио подберёт похожие.")}
          </p>
        </div>
      ) : (
        <>
          <section>
            <h2 className="px-4 pt-2 pb-1 text-[12px] font-medium uppercase tracking-[0.1em] text-subtle">
              {tx("Сейчас играет")}
            </h2>
            <TrackRow track={current} onPlay={() => jumpTo(index)} />
          </section>

          <section className="mt-4">
            <div className="flex items-center justify-between px-4 pb-1">
              <h2 className="text-[12px] font-medium uppercase tracking-[0.1em] text-subtle">
                {tx("Далее ")}{upcoming.length > 0 && <span className="text-subtle/70">· {upcoming.length}</span>}
              </h2>
              {upcoming.length > 0 && (
                <button type="button" onClick={clearUpcoming} className="text-[13px] text-muted hover:text-fg">
                  {tx("Очистить")}
                </button>
              )}
            </div>
            {upcoming.map((t, k) => {
              const i = index + 1 + k;
              return (
                <TrackRow
                  key={`${t.id}-${i}`}
                  track={t}
                  onPlay={() => jumpTo(i)}
                  trailing={
                    <button
                      type="button"
                      onClick={() => removeFromQueue(i)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-subtle hover:text-fg active:bg-fg/10"
                      aria-label={tx("Убрать из очереди")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  }
                />
              );
            })}
            {radioLoading && (
              <>
                <div className="flex items-center gap-2 px-4 py-2 text-[13px] text-subtle">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />{tx(" Подбираем похожие треки…")}
                </div>
                <TrackRowSkeleton />
                <TrackRowSkeleton />
              </>
            )}
            {!radioLoading && upcoming.length === 0 && (
              <p className="px-4 py-3 text-sm text-subtle">
                {radio ? tx("Радио добавит треки автоматически.") : tx("Включите «Радио» для бесконечного воспроизведения.")}
              </p>
            )}
          </section>

          {history.length > 0 && (
            <section className="mt-6">
              <h2 className="px-4 pb-1 text-[12px] font-medium uppercase tracking-[0.1em] text-subtle">
                {tx("Ранее")}
              </h2>
              {history.map((t, i) => (
                <TrackRow key={`${t.id}-${i}`} track={t} dimmed onPlay={() => jumpTo(i)} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
