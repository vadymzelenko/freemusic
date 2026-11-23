"use client";

import { ArrowLeft, Globe2, Languages, Loader2, Search as SearchIcon, Tag, TrendingUp, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { StationRow } from "@/components/radio/StationRow";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n";
import { flag, tagLabel, type Station } from "@/lib/radio/types";
import { getJSON, useApi } from "@/lib/use-api";
import { useDebounced } from "@/lib/use-debounce";

type Facet = { name: string; code?: string; count: number };
type Order = "clickcount" | "votes" | "clicktrend" | "name";
interface Filter {
  q?: string;
  tag?: string;
  cc?: string;
  lang?: string;
  order: Order;
  /** whole catalog, no filter */
  all?: boolean;
}

const PAGE = 50;
const ORDERS: { id: Order; label: string }[] = [
  { id: "clickcount", label: "Популярные" },
  { id: "votes", label: "По голосам" },
  { id: "clicktrend", label: "В тренде" },
  { id: "name", label: "А–Я" },
];

function readUrl(): Filter {
  if (typeof window === "undefined") return { order: "clickcount" };
  const p = new URLSearchParams(window.location.search);
  const order = (p.get("order") as Order) || "clickcount";
  return {
    q: p.get("q") || undefined,
    tag: p.get("tag") || undefined,
    cc: p.get("cc") || undefined,
    lang: p.get("lang") || undefined,
    order: ORDERS.some((o) => o.id === order) ? order : "clickcount",
    all: p.has("all"),
  };
}

function toQuery(f: Filter): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.tag) p.set("tag", f.tag);
  if (f.cc) p.set("cc", f.cc);
  if (f.lang) p.set("lang", f.lang);
  if (f.order !== "clickcount") p.set("order", f.order);
  if (f.all && !f.q && !f.tag && !f.cc && !f.lang) p.set("all", "1");
  return p.toString();
}

const isEmpty = (f: Filter) => !f.q && !f.tag && !f.cc && !f.lang && !f.all && f.order === "clickcount";

/** Infinite list over the whole Radio Browser catalog for the given filter. */
function CatalogList({ f }: { f: Filter }) {
  const [items, setItems] = useState<Station[]>([]);
  const [next, setNext] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const key = toQuery(f);
  const loadingRef = useRef(false);

  useEffect(() => {
    setItems([]);
    setNext(0);
    setError(false);
  }, [key]);

  const load = async (offset: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const qs = new URLSearchParams(key);
      qs.set("offset", String(offset));
      qs.set("limit", String(PAGE));
      const r = await getJSON<{ stations: Station[]; next: number | null }>(`/api/radio/search?${qs}`);
      if (toQuery(f) !== key) return;
      setItems((cur) => {
        const have = new Set(cur.map((s) => s.id));
        const names = new Set(cur.map((s) => s.name.toLowerCase()));
        return [...cur, ...r.stations.filter((s) => !have.has(s.id) && !names.has(s.name.toLowerCase()))];
      });
      setNext(r.stations.length ? r.next : null);
    } catch {
      setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    const el = sentinel.current;
    if (!el || next === null || error) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && void load(next), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, key, error, items.length]);

  return (
    <>
      <div className="md:grid md:grid-cols-2 md:gap-x-4">
        {items.map((s) => (
          <StationRow key={s.id} s={s} />
        ))}
      </div>
      {loading && !items.length && (
        <div className="space-y-2 px-4 md:px-0">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton h-14 rounded-xl" />
          ))}
        </div>
      )}
      <div ref={sentinel} className="flex h-16 items-center justify-center text-sm text-subtle">
        {loading && items.length > 0 && <Loader2 className="h-5 w-5 animate-spin" />}
        {error && (
          <button type="button" onClick={() => setError(false)} className="text-muted underline">
            {tx("Не загрузилось. Повторить")}
          </button>
        )}
        {next === null && !loading && (items.length ? tx("Это все станции — {n}", { n: items.length }) : tx("Ничего не найдено"))}
      </div>
    </>
  );
}

function FacetGrid({ items, onPick, kind }: { items: Facet[]; onPick: (f: Facet) => void; kind: "tag" | "cc" | "lang" }) {
  return (
    <div className="flex flex-wrap gap-2 px-4 md:px-0">
      {items.map((x) => (
        <button
          key={x.code ?? x.name}
          type="button"
          onClick={() => onPick(x)}
          className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-[13.5px] font-medium text-muted transition-colors hover:text-fg"
        >
          {kind === "cc" && <span>{flag(x.code!)}</span>}
          <span className="text-fg">{kind === "tag" ? tx(tagLabel(x.name)) : x.name}</span>
          <span className="text-[11.5px] text-subtle">{x.count.toLocaleString()}</span>
        </button>
      ))}
    </div>
  );
}

export default function ExplorePage() {
  const [f, setF] = useState<Filter>({ order: "clickcount" });
  const [q, setQ] = useState("");
  const [moreC, setMoreC] = useState(false);
  const dq = useDebounced(q.trim(), 400);
  const facets = useApi<{ countries: Facet[]; tags: Facet[]; languages: Facet[] }>("/api/radio/facets");
  const total = useMemo(() => facets.data?.countries.reduce((n, c) => n + c.count, 0) ?? 0, [facets.data]);

  // read filters from the URL once (shelves on the home screen link here)
  useEffect(() => {
    const init = readUrl();
    setF(init);
    setQ(init.q ?? "");
    const onPop = () => {
      const x = readUrl();
      setF(x);
      setQ(x.q ?? "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const apply = (next: Filter, push = true) => {
    setF(next);
    const qs = toQuery(next);
    const url = `/explore${qs ? `?${qs}` : ""}`;
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if ((dq || undefined) === f.q) return;
    apply({ ...f, q: dq || undefined }, !f.q && !!dq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const ccName = f.cc ? (facets.data?.countries.find((c) => c.code === f.cc)?.name ?? f.cc) : "";
  const filtered = !isEmpty(f);

  return (
    <div className="pb-4">
      <header className="px-4 pt-6 pb-3 md:px-0 md:pt-8">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight md:text-[34px]">{tx("Обзор")}</h1>
        <p className="text-[13px] text-muted">
          {total ? tx("{n} станций со всего мира", { n: total.toLocaleString() }) : tx("Станции со всего мира")}
        </p>
      </header>

      <div className="sticky top-[var(--safe-top)] z-20 bg-bg/90 px-4 py-2 backdrop-blur md:px-0">
        <div className="flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:border-line-strong md:max-w-xl">
          <SearchIcon className="h-[18px] w-[18px] text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tx("Станция, город, частота…")}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-subtle"
            enterKeyHint="search"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} className="text-muted" aria-label={tx("Очистить")}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {filtered && (
          <div className="no-scrollbar mt-2 flex items-center gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setQ("");
                apply({ order: "clickcount" });
              }}
              className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-line px-2.5 text-[13px] text-muted"
              aria-label={tx("Сбросить")}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            {f.tag && (
              <button type="button" onClick={() => apply({ ...f, tag: undefined })} className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-fg px-3 text-[13px] font-medium text-bg">
                {tx(tagLabel(f.tag))} <X className="h-3.5 w-3.5" />
              </button>
            )}
            {f.cc && (
              <button type="button" onClick={() => apply({ ...f, cc: undefined })} className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-fg px-3 text-[13px] font-medium text-bg">
                {flag(f.cc)} {ccName} <X className="h-3.5 w-3.5" />
              </button>
            )}
            {f.lang && (
              <button type="button" onClick={() => apply({ ...f, lang: undefined })} className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-fg px-3 text-[13px] font-medium text-bg">
                {f.lang} <X className="h-3.5 w-3.5" />
              </button>
            )}
            <span className="mx-1 h-5 w-px shrink-0 bg-line" />
            {ORDERS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => apply({ ...f, order: o.id }, false)}
                className={cn(
                  "h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium",
                  f.order === o.id ? "border-fg text-fg" : "border-line text-muted",
                )}
              >
                {tx(o.label)}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered ? (
        <div className="mt-2">
          <CatalogList f={f} />
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 px-4 md:grid-cols-4 md:px-0">
            {[
              { icon: Trophy, label: "Самые популярные", order: "clickcount" as Order, grad: "from-amber-500/30" },
              { icon: TrendingUp, label: "В тренде", order: "clicktrend" as Order, grad: "from-rose-500/30" },
              { icon: Trophy, label: "Любимые слушателей", order: "votes" as Order, grad: "from-violet-500/30" },
              { icon: Globe2, label: "Весь каталог А–Я", order: "name" as Order, grad: "from-sky-500/30" },
            ].map((x) => (
              <button
                key={x.label}
                type="button"
                onClick={() => apply({ order: x.order, all: true })}
                className={cn("flex h-20 flex-col justify-between rounded-xl border border-line bg-gradient-to-br to-card p-3 text-left", x.grad)}
              >
                <x.icon className="h-5 w-5" />
                <span className="text-[14px] font-semibold leading-tight">{tx(x.label)}</span>
              </button>
            ))}
          </div>

          <h2 className="mt-8 mb-3 flex items-center gap-2 px-4 text-[19px] font-bold tracking-tight md:px-0">
            <Tag className="h-5 w-5" /> {tx("Жанры")}
          </h2>
          {facets.data ? (
            <FacetGrid kind="tag" items={facets.data.tags.slice(0, 48)} onPick={(x) => apply({ order: "clickcount", tag: x.name })} />
          ) : (
            <div className="flex flex-wrap gap-2 px-4 md:px-0">
              {Array.from({ length: 18 }, (_, i) => (
                <div key={i} className="skeleton h-9 w-24 rounded-full" />
              ))}
            </div>
          )}

          <h2 className="mt-8 mb-3 flex items-center gap-2 px-4 text-[19px] font-bold tracking-tight md:px-0">
            <Globe2 className="h-5 w-5" /> {tx("Страны")}
          </h2>
          {facets.data && (
            <>
              <FacetGrid kind="cc" items={facets.data.countries.slice(0, moreC ? 250 : 36)} onPick={(x) => apply({ order: "clickcount", cc: x.code })} />
              {!moreC && facets.data.countries.length > 36 && (
                <button type="button" onClick={() => setMoreC(true)} className="mx-4 mt-3 text-[13.5px] font-medium text-muted underline md:mx-0">
                  {tx("Показать все страны ({n})", { n: facets.data.countries.length })}
                </button>
              )}
            </>
          )}

          <h2 className="mt-8 mb-3 flex items-center gap-2 px-4 text-[19px] font-bold tracking-tight md:px-0">
            <Languages className="h-5 w-5" /> {tx("Языки")}
          </h2>
          {facets.data && <FacetGrid kind="lang" items={facets.data.languages.slice(0, 40)} onPick={(x) => apply({ order: "clickcount", lang: x.name })} />}

          <p className="mx-4 mt-10 text-[11.5px] leading-relaxed text-subtle md:mx-0">
            {tx("Каталог станций — Radio Browser (radio-browser.info). Звук идёт напрямую от радиостанций.")}
          </p>
        </>
      )}
    </div>
  );
}
