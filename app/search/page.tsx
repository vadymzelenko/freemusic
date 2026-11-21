"use client";

import { ArrowUpLeft, Clock, Search as SearchIcon, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { AlbumCard, ArtistCircle } from "@/components/Cards";
import { PageHeader } from "@/components/PageHeader";
import { TrackRow } from "@/components/TrackRow";
import { Cover } from "@/components/ui/Cover";
import { Shelf, ShelfSkeleton } from "@/components/ui/Shelf";
import { TrackListSkeleton } from "@/components/ui/Skeleton";
import { usePlayer } from "@/components/player/PlayerProvider";
import { cn } from "@/lib/cn";
import type { SearchResults, Suggestions, Track } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { useDebounced } from "@/lib/use-debounce";
import { useLibrary } from "@/store/library";

type Tab = "all" | "song" | "album" | "artist";
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Всё" },
  { id: "song", label: "Треки" },
  { id: "album", label: "Альбомы" },
  { id: "artist", label: "Артисты" },
];

function useLocalMatches(q: string): Track[] {
  const tracks = useLibrary((s) => s.tracks);
  const liked = useLibrary((s) => s.likedIds);
  const playlists = useLibrary((s) => s.playlists);
  return useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const ids = new Set([...liked, ...playlists.flatMap((p) => p.trackIds)]);
    const out: Track[] = [];
    for (const id of ids) {
      const t = tracks[id];
      if (t && `${t.title} ${t.artist} ${t.album ?? ""}`.toLowerCase().includes(needle)) out.push(t);
      if (out.length >= 3) break;
    }
    return out;
  }, [q, tracks, liked, playlists]);
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const { playTrack, playTracks, setRadio } = usePlayer();
  const history = useLibrary((s) => s.searchHistory);
  const pushSearch = useLibrary((s) => s.pushSearch);
  const clearHistory = useLibrary((s) => s.clearSearchHistory);

  const q = query.trim();
  const suggestQ = useDebounced(q, 120);
  const resultsQ = useDebounced(q, 450);
  const local = useLocalMatches(q);

  const suggestions = useApi<Suggestions>(focused && suggestQ ? `/api/suggest?q=${encodeURIComponent(suggestQ)}` : null);
  const results = useApi<SearchResults>(resultsQ ? `/api/search?type=${tab}&q=${encodeURIComponent(resultsQ)}` : null);

  const submit = (value: string) => {
    setQuery(value);
    pushSearch(value);
    setFocused(false);
    inputRef.current?.blur();
  };

  const playSong = (t: Track, list?: Track[]) => {
    if (q) pushSearch(q);
    setRadio(true);
    if (list && tab === "song") playTracks(list, list.indexOf(t));
    else playTrack(t);
  };

  const showSuggestions = focused && !!q && !!suggestions.data;
  const data = results.data;

  return (
    <div>
      <PageHeader title="Поиск" />
      <div className="sticky top-[var(--safe-top)] z-30 bg-bg/85 px-4 pt-1 pb-2 backdrop-blur-xl">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (q) submit(q);
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
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Треки, альбомы, артисты"
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

        {q && !showSuggestions && (
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "h-8 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                  tab === t.id ? "border-fg bg-fg text-bg" : "border-line bg-card text-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Suggestions overlay */}
      {showSuggestions && suggestions.data && (
        <div className="px-2 pb-4">
          {suggestions.data.queries.map((s) => (
            <div key={s} className="flex items-center">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submit(s)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2.5 text-left text-[15px] active:bg-white/[0.04]"
              >
                <SearchIcon className="h-4 w-4 shrink-0 text-subtle" />
                <span className="truncate">{s}</span>
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQuery(`${s} `);
                  inputRef.current?.focus();
                }}
                className="flex h-9 w-9 items-center justify-center text-subtle"
                aria-label="Дополнить"
              >
                <ArrowUpLeft className="h-4 w-4" />
              </button>
            </div>
          ))}
          {(suggestions.data.artists.length > 0 || suggestions.data.songs.length > 0 || suggestions.data.albums.length > 0) && (
            <div className="mt-1 border-t border-line pt-1">
              {suggestions.data.artists.slice(0, 2).map((a) => (
                <Link
                  key={a.id}
                  href={`/artist/${a.id}`}
                  onClick={() => pushSearch(a.name)}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 active:bg-white/[0.04]"
                >
                  <Cover src={a.thumbnail} alt="" className="h-11 w-11" rounded="rounded-full" />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium">{a.name}</div>
                    <div className="text-[12.5px] text-muted">Артист</div>
                  </div>
                </Link>
              ))}
              {suggestions.data.albums.slice(0, 2).map((al) => (
                <Link
                  key={al.id}
                  href={`/album/${al.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 active:bg-white/[0.04]"
                >
                  <Cover src={al.cover} alt="" className="h-11 w-11" />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium">{al.title}</div>
                    <div className="truncate text-[12.5px] text-muted">Альбом · {al.artist}</div>
                  </div>
                </Link>
              ))}
              {suggestions.data.songs.slice(0, 3).map((t) => (
                <div key={t.id} onMouseDown={(e) => e.preventDefault()}>
                  <TrackRow track={t} onPlay={() => playSong(t)} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state: history */}
      {!q && (
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
              <p className="mt-1 max-w-xs text-sm text-subtle">Весь каталог YouTube Music: треки, альбомы и артисты.</p>
            </div>
          )}
        </section>
      )}

      {/* Results */}
      {q && !showSuggestions && (
        <div>
          {local.length > 0 && tab !== "album" && tab !== "artist" && (
            <section className="pt-2">
              <h2 className="px-4 pb-1 text-[12px] font-medium uppercase tracking-[0.1em] text-subtle">В медиатеке</h2>
              {local.map((t) => (
                <TrackRow key={t.id} track={t} onPlay={() => playSong(t)} />
              ))}
            </section>
          )}

          {results.error && (
            <div className="mx-4 mt-4 rounded-xl border border-line bg-card p-4 text-sm">
              <p className="font-medium">Не удалось выполнить поиск</p>
              <p className="mt-1 break-words text-subtle">{results.error}</p>
            </div>
          )}

          {!data && !results.error && (tab === "all" ? <><ShelfSkeleton round /><TrackListSkeleton count={6} /></> : <TrackListSkeleton count={10} />)}

          {data && tab === "all" && (
            <>
              {data.artists.length > 0 && (
                <Shelf title="Артисты">
                  {data.artists.slice(0, 10).map((a) => (
                    <ArtistCircle key={a.id} artist={a} width={104} />
                  ))}
                </Shelf>
              )}
              {data.songs.length > 0 && (
                <section className="mt-6">
                  <div className="flex items-end justify-between px-4 pb-1">
                    <h2 className="text-[19px] font-bold tracking-tight">Треки</h2>
                    <button type="button" onClick={() => setTab("song")} className="text-[13px] text-muted hover:text-fg">
                      Все
                    </button>
                  </div>
                  {data.songs.slice(0, 6).map((t) => (
                    <TrackRow key={t.id} track={t} onPlay={() => playSong(t)} />
                  ))}
                </section>
              )}
              {data.albums.length > 0 && (
                <Shelf title="Альбомы">
                  {data.albums.slice(0, 12).map((a) => (
                    <AlbumCard key={a.id} album={a} />
                  ))}
                </Shelf>
              )}
              {!data.songs.length && !data.albums.length && !data.artists.length && (
                <p className="px-4 pt-10 text-center text-sm text-subtle">Ничего не найдено по «{resultsQ}»</p>
              )}
            </>
          )}

          {data && tab === "song" && (
            <div className="pt-1">
              {data.songs.map((t) => (
                <TrackRow key={t.id} track={t} onPlay={() => playSong(t, data.songs)} />
              ))}
              {!data.songs.length && <p className="px-4 pt-10 text-center text-sm text-subtle">Треков не найдено</p>}
            </div>
          )}

          {data && tab === "album" && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 px-4 pt-3 sm:grid-cols-3">
              {data.albums.map((a) => (
                <AlbumCard key={a.id} album={a} fluid />
              ))}
              {!data.albums.length && <p className="col-span-full pt-10 text-center text-sm text-subtle">Альбомов не найдено</p>}
            </div>
          )}

          {data && tab === "artist" && (
            <div className="pt-1">
              {data.artists.map((a) => (
                <Link
                  key={a.id}
                  href={`/artist/${a.id}`}
                  className="flex items-center gap-3 px-4 py-2 active:bg-white/[0.04]"
                >
                  <Cover src={a.thumbnail} alt="" className="h-14 w-14" rounded="rounded-full" />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium">{a.name}</div>
                    {a.subtitle && <div className="truncate text-[12.5px] text-muted">{a.subtitle}</div>}
                  </div>
                </Link>
              ))}
              {!data.artists.length && <p className="px-4 pt-10 text-center text-sm text-subtle">Артистов не найдено</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
