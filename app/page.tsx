"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock, Search as SearchIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { TrackRow } from "@/components/TrackRow";
import { TrackListSkeleton } from "@/components/ui/Skeleton";
import { usePlayer } from "@/components/player/PlayerProvider";
import { apiUrl } from "@/lib/format";
import type { Track } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounce";
import { useLibrary } from "@/store/library";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; query: string; tracks: Track[] }
  | { status: "error"; message: string };

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 350);
  const [state, setState] = useState<State>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const { playTrack } = usePlayer();
  const history = useLibrary((s) => s.searchHistory);
  const pushSearch = useLibrary((s) => s.pushSearch);
  const clearHistory = useLibrary((s) => s.clearSearchHistory);

  useEffect(() => {
    if (!debounced) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: "loading" });
    fetch(apiUrl(`/api/search?q=${encodeURIComponent(debounced)}`), { signal: ctrl.signal })
      .then(async (r) => {
        const data = (await r.json()) as { tracks?: Track[]; error?: string };
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        setState({ status: "done", query: debounced, tracks: data.tracks ?? [] });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ status: "error", message: e instanceof Error ? e.message : "Ошибка" });
      });
    return () => ctrl.abort();
  }, [debounced]);

  const onPlay = (t: Track) => {
    pushSearch(debounced || t.title);
    playTrack(t);
  };

  return (
    <div>
      <PageHeader title="Поиск" />
      <div className="sticky top-[var(--safe-top)] z-30 bg-bg/85 px-4 pt-1 pb-3 backdrop-blur-xl">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            inputRef.current?.blur();
            if (query.trim()) pushSearch(query);
          }}
          className="flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 transition-colors focus-within:border-line-strong"
        >
          <SearchIcon className="h-[18px] w-[18px] shrink-0 text-subtle" />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Артисты, треки, альбомы"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-subtle"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-muted"
              aria-label="Очистить"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </form>
      </div>

      {state.status === "idle" && (
        <section className="px-4 pt-2">
          {history.length > 0 ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[13px] font-medium uppercase tracking-[0.1em] text-subtle">Недавние</h2>
                <button type="button" onClick={clearHistory} className="text-[13px] text-muted hover:text-fg">
                  Очистить
                </button>
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
                {history.map((h) => (
                  <li key={h}>
                    <button
                      type="button"
                      onClick={() => setQuery(h)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] active:bg-white/[0.04] md:hover:bg-white/[0.03]"
                    >
                      <Clock className="h-4 w-4 text-subtle" />
                      <span className="truncate">{h}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="mt-16 flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-card">
                <SearchIcon className="h-6 w-6 text-muted" />
              </div>
              <p className="text-[15px] font-medium">Найдите любимую музыку</p>
              <p className="mt-1 max-w-xs text-sm text-subtle">
                Весь каталог YouTube Music — треки играют в фоне даже при заблокированном экране.
              </p>
            </div>
          )}
        </section>
      )}

      {state.status === "loading" && <TrackListSkeleton count={10} />}

      {state.status === "error" && (
        <div className="mx-4 mt-4 rounded-xl border border-line bg-card p-4 text-sm">
          <p className="font-medium">Не удалось выполнить поиск</p>
          <p className="mt-1 break-words text-subtle">{state.message}</p>
        </div>
      )}

      {state.status === "done" && (
        <AnimatePresence mode="wait">
          <motion.div
            key={state.query}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {state.tracks.length === 0 ? (
              <p className="px-4 pt-10 text-center text-sm text-subtle">Ничего не найдено по «{state.query}»</p>
            ) : (
              <div className="pt-1">
                {state.tracks.map((t) => (
                  <TrackRow key={t.id} track={t} onPlay={() => onPlay(t)} />
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
