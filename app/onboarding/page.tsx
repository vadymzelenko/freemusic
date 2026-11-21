"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Search as SearchIcon, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Cover } from "@/components/ui/Cover";
import { cn } from "@/lib/cn";
import { artistKey, type ArtistPage, type ArtistSummary, type SearchResults } from "@/lib/types";
import { getJSON, useApi } from "@/lib/use-api";
import { useDebounced } from "@/lib/use-debounce";
import { useLibrary } from "@/store/library";

const MIN_PICKS = 3;

function ArtistTile({ artist, selected, onToggle }: { artist: ArtistSummary; selected: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="min-w-0 text-center" aria-pressed={selected}>
      <div className="relative mx-auto aspect-square w-full max-w-[112px]">
        <Cover
          src={artist.thumbnail}
          alt=""
          rounded="rounded-full"
          className={cn("h-full w-full transition-all duration-200", selected && "scale-[0.92] opacity-60")}
        />
        <AnimatePresence>
          {selected && (
            <motion.span
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fg text-bg shadow-lg">
                <Check className="h-5 w-5" strokeWidth={3} />
              </span>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className={cn("mt-2 truncate text-[13px] font-medium", selected ? "text-fg" : "text-fg/85")}>{artist.name}</div>
    </button>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i}>
          <div className="skeleton mx-auto aspect-square w-full max-w-[112px] rounded-full" />
          <div className="skeleton mx-auto mt-2 h-3 w-2/3 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const artists = useLibrary((s) => s.artists);
  const follow = useLibrary((s) => s.followArtist);
  const unfollow = useLibrary((s) => s.unfollowArtist);
  const setOnboarded = useLibrary((s) => s.setOnboarded);
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 300);
  const [related, setRelated] = useState<ArtistSummary[]>([]);

  const popular = useApi<{ genres: { genre: string; artists: ArtistSummary[] }[] }>("/api/artists/popular");
  const found = useApi<SearchResults>(q ? `/api/search?type=artist&q=${encodeURIComponent(q)}` : null);

  const selected = useMemo(() => new Set(artists.map((a) => a.key)), [artists]);

  const toggle = (a: ArtistSummary) => {
    const key = artistKey(a.name);
    if (selected.has(key)) {
      unfollow(key);
      return;
    }
    follow({ id: a.id, name: a.name, thumbnail: a.thumbnail });
    // YouTube's "fans might also like" → suggest similar artists right away
    getJSON<ArtistPage>(`/api/artist?id=${encodeURIComponent(a.id)}`)
      .then((page) =>
        setRelated((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...page.related.filter((x) => !seen.has(x.id)).slice(0, 6), ...prev].slice(0, 18);
        }),
      )
      .catch(() => {});
  };

  useEffect(() => {
    // preload already-picked artists' relatives when revisiting from settings
    if (artists.length && !related.length) {
      const withId = artists.filter((a) => a.id).slice(0, 3);
      Promise.allSettled(withId.map((a) => getJSON<ArtistPage>(`/api/artist?id=${a.id}`))).then((rs) => {
        const out: ArtistSummary[] = [];
        for (const r of rs) if (r.status === "fulfilled") out.push(...r.value.related.slice(0, 6));
        setRelated(out.filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    setOnboarded(true);
    router.replace("/");
  };

  const relatedVisible = related.filter((a) => !selected.has(artistKey(a.name)));
  const picks = artists.length;

  return (
    <div className="pb-24">
      <header className="px-4 pt-8 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight">Что вы слушаете?</h1>
            <p className="mt-1 text-[14px] text-muted">
              Выберите хотя бы {MIN_PICKS} артистов — по ним мы соберём рекомендации. Поменять можно в настройках.
            </p>
          </div>
          <button type="button" onClick={finish} className="shrink-0 pt-1 text-[14px] text-subtle hover:text-fg">
            Пропустить
          </button>
        </div>
      </header>

      <div className="sticky top-[var(--safe-top)] z-30 bg-bg/85 px-4 pb-3 backdrop-blur-xl">
        <div className="flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:border-line-strong">
          <SearchIcon className="h-[18px] w-[18px] text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти артиста"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-subtle"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="text-muted" aria-label="Очистить">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {picks > 0 && (
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {artists.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => unfollow(a.key)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-card pl-1 pr-2.5 text-[12.5px]"
              >
                <Cover src={a.thumbnail} alt="" className="h-6 w-6" rounded="rounded-full" />
                {a.name}
                <X className="h-3 w-3 text-subtle" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4">
        {q ? (
          found.data ? (
            <div className="grid grid-cols-3 gap-x-3 gap-y-5 pt-2 sm:grid-cols-4">
              {found.data.artists.slice(0, 12).map((a) => (
                <ArtistTile key={a.id} artist={a} selected={selected.has(artistKey(a.name))} onToggle={() => toggle(a)} />
              ))}
              {!found.data.artists.length && <p className="col-span-full py-8 text-center text-sm text-subtle">Никого не нашли</p>}
            </div>
          ) : (
            <SkeletonGrid />
          )
        ) : (
          <>
            {relatedVisible.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-[17px] font-semibold">Вам может понравиться</h2>
                <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4">
                  {relatedVisible.slice(0, 9).map((a) => (
                    <ArtistTile key={a.id} artist={a} selected={false} onToggle={() => toggle(a)} />
                  ))}
                </div>
              </section>
            )}
            {popular.error && !popular.data && (
              <p className="py-8 text-center text-sm text-subtle">Не удалось загрузить артистов: {popular.error}</p>
            )}
            {!popular.data && !popular.error && <SkeletonGrid />}
            {popular.data?.genres.map((g) => (
              <section key={g.genre} className="mb-8">
                <h2 className="mb-3 text-[17px] font-semibold">{g.genre}</h2>
                <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4">
                  {g.artists.map((a) => (
                    <ArtistTile key={a.id} artist={a} selected={selected.has(artistKey(a.name))} onToggle={() => toggle(a)} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      <div
        className="fixed inset-x-0 z-[45] px-4"
        style={{ bottom: "calc(var(--tabbar-h) + var(--safe-bottom) + 10px)" }}
      >
        <button
          type="button"
          onClick={finish}
          disabled={picks < MIN_PICKS}
          className="mx-auto flex h-12 w-full max-w-md items-center justify-center rounded-xl bg-fg text-[15px] font-semibold text-bg shadow-2xl transition-opacity disabled:opacity-40"
        >
          {picks < MIN_PICKS ? `Выберите ещё ${MIN_PICKS - picks}` : `Готово · ${picks}`}
        </button>
      </div>
    </div>
  );
}
