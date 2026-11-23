"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, Loader2, Megaphone, MessageSquare, Search, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/Sidebar";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n";
import { flag, RADIO_ERAS, RADIO_GENRES } from "@/lib/radio/types";
import { getJSON, useApi } from "@/lib/use-api";
import { useDebounced } from "@/lib/use-debounce";
import { useHydrated, useLibrary } from "@/store/library";

type Artist = { id: string; name: string; picture: string };
type Facet = { name: string; code?: string; count: number };

const STEPS = 4;

function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

/** "ru-RU" → RU, "pl" → PL, "en-GB" → GB */
function guessCountry(): string | null {
  if (typeof navigator === "undefined") return null;
  for (const l of navigator.languages ?? [navigator.language]) {
    const m = /^([a-z]{2})(?:-([A-Z]{2}))?/i.exec(l);
    if (m?.[2]) return m[2].toUpperCase();
    const byLang: Record<string, string> = { ru: "RU", pl: "PL", uk: "UA", de: "DE", fr: "FR", it: "IT", es: "ES", be: "BY", kk: "KZ" };
    if (m?.[1] && byLang[m[1].toLowerCase()]) return byLang[m[1].toLowerCase()]!;
  }
  return null;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition-colors",
        on ? "border-fg bg-fg text-bg" : "border-line bg-card text-muted hover:text-fg",
      )}
    >
      {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      {children}
    </button>
  );
}

/* ---------------- step 1: genres ---------------- */

function GenresStep({ tags, toggle }: { tags: string[]; toggle: (t: string) => void }) {
  const dz = useApi<{ genres: { id: number; picture: string }[] }>("/api/meta/genres");
  const pic = (id?: number) => (id ? dz.data?.genres.find((g) => g.id === id)?.picture : undefined);
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {RADIO_GENRES.map((g) => {
          const on = tags.includes(g.tag);
          const p = pic(g.dz);
          const h = hue(g.tag);
          return (
            <button
              key={g.tag}
              type="button"
              onClick={() => toggle(g.tag)}
              aria-pressed={on}
              className={cn(
                "relative h-[76px] overflow-hidden rounded-xl text-left transition-transform active:scale-[0.97]",
                on && "ring-2 ring-fg ring-offset-2 ring-offset-bg",
              )}
              style={{ background: `linear-gradient(135deg, hsl(${h} 60% 42%), hsl(${(h + 50) % 360} 65% 24%))` }}
            >
              {p && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p} alt="" className="absolute -right-3 -bottom-3 h-[70px] w-[70px] rotate-[18deg] rounded-md object-cover opacity-90 shadow-lg" />
              )}
              <span className="relative block p-3 text-[15px] font-bold leading-tight text-white drop-shadow">{tx(g.label)}</span>
              {on && (
                <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-black">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <h3 className="mt-7 mb-2.5 text-[15px] font-semibold text-muted">{tx("Любимые десятилетия")}</h3>
      <div className="flex flex-wrap gap-2">
        {RADIO_ERAS.map((e) => (
          <Chip key={e.tag} on={tags.includes(e.tag)} onClick={() => toggle(e.tag)}>
            {tx(e.label)}
          </Chip>
        ))}
      </div>
    </>
  );
}

/* ---------------- step 2: artists ---------------- */

function ArtistsStep({ tags, picked, toggle }: { tags: string[]; picked: Map<string, Artist>; toggle: (a: Artist) => void }) {
  const [list, setList] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 350);
  const found = useApi<{ artists: Artist[] }>(dq ? `/api/meta/artists?q=${encodeURIComponent(dq)}` : null, { keep: true });

  useEffect(() => {
    let alive = true;
    const ids = RADIO_GENRES.filter((g) => g.dz && tags.includes(g.tag)).map((g) => g.dz!);
    const use = ids.length ? ids.slice(0, 5) : [132, 152];
    void Promise.allSettled(use.map((id) => getJSON<{ artists: Artist[] }>(`/api/meta/genres?id=${id}`))).then((res) => {
      if (!alive) return;
      const cols = res.map((r) => (r.status === "fulfilled" ? r.value.artists : []));
      const out: Artist[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < 30; i++)
        for (const c of cols) {
          const a = c[i];
          if (a && !seen.has(a.id)) {
            seen.add(a.id);
            out.push(a);
          }
        }
      setList(out);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [tags]);

  const pick = (a: Artist) => {
    const was = picked.has(a.id);
    toggle(a);
    if (was) return;
    // like Spotify: picking an artist reveals similar ones right after it
    void getJSON<{ artists: Artist[] }>(`/api/meta/related?id=${a.id}`)
      .then((r) =>
        setList((cur) => {
          const have = new Set(cur.map((x) => x.id));
          const add = r.artists.filter((x) => !have.has(x.id)).slice(0, 6);
          const i = cur.findIndex((x) => x.id === a.id);
          if (i < 0) return [a, ...add, ...cur];
          return [...cur.slice(0, i + 1), ...add, ...cur.slice(i + 1)];
        }),
      )
      .catch(() => {});
  };

  const shown = dq ? (found.data?.artists ?? []) : list;

  return (
    <>
      <div className="flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:border-line-strong">
        <Search className="h-[18px] w-[18px] text-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tx("Найти артиста")}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-subtle"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="text-muted" aria-label={tx("Очистить")}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {loading && !dq ? (
        <div className="mt-5 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i}>
              <div className="skeleton aspect-square rounded-full" />
              <div className="skeleton mx-auto mt-2 h-3 w-2/3 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <motion.div layout className={cn("mt-5 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4", found.stale && "opacity-60")}>
          {shown.map((a) => {
            const on = picked.has(a.id);
            return (
              <motion.button
                layout
                key={a.id}
                type="button"
                onClick={() => pick(a)}
                aria-pressed={on}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <div className={cn("relative mx-auto aspect-square w-full overflow-hidden rounded-full bg-fg/5 transition-transform active:scale-95", on && "ring-[3px] ring-fg ring-offset-2 ring-offset-bg")}>
                  {a.picture && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.picture} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                  {on && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/45">
                      <Check className="h-8 w-8 text-white" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className="mt-1.5 truncate text-[13px] font-medium">{a.name}</div>
              </motion.button>
            );
          })}
          {dq && found.data && !found.data.artists.length && <p className="col-span-full py-6 text-center text-sm text-subtle">{tx("Ничего не найдено")}</p>}
        </motion.div>
      )}
    </>
  );
}

/* ---------------- step 3: countries & languages ---------------- */

function PlacesStep({
  countries,
  toggleCountry,
  langs,
  toggleLang,
}: {
  countries: string[];
  toggleCountry: (c: string) => void;
  langs: string[];
  toggleLang: (l: string) => void;
}) {
  const facets = useApi<{ countries: Facet[]; languages: Facet[] }>("/api/radio/facets");
  const [q, setQ] = useState("");
  const all = facets.data?.countries ?? [];
  const list = q
    ? all.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.code?.toLowerCase() === q.toLowerCase())
    : [...all.filter((c) => countries.includes(c.code!)), ...all.filter((c) => !countries.includes(c.code!)).slice(0, 24)];

  return (
    <>
      <div className="flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:border-line-strong">
        <Search className="h-[18px] w-[18px] text-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tx("Страна")}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-subtle"
        />
      </div>
      {!facets.data ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 14 }, (_, i) => (
            <div key={i} className="skeleton h-9 w-28 rounded-full" />
          ))}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {list.map((c) => (
            <Chip key={c.code} on={countries.includes(c.code!)} onClick={() => toggleCountry(c.code!)}>
              <span>{flag(c.code!)}</span> {c.name}
              <span className="text-[11.5px] opacity-50">{c.count}</span>
            </Chip>
          ))}
        </div>
      )}
      {facets.data && (
        <>
          <h3 className="mt-7 mb-2.5 text-[15px] font-semibold text-muted">{tx("Языки эфира (необязательно)")}</h3>
          <div className="flex flex-wrap gap-2">
            {facets.data.languages.slice(0, 18).map((l) => (
              <Chip key={l.name} on={langs.includes(l.name)} onClick={() => toggleLang(l.name)}>
                {l.name}
              </Chip>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* ---------------- step 4: ads & smart radio ---------------- */

function Toggle({ on, onClick, icon: Icon, title, text }: { on: boolean; onClick: () => void; icon: typeof Megaphone; title: string; text: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn("flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left transition-colors", on ? "border-fg/40 bg-fg/[0.06]" : "border-line bg-card")}
    >
      <Icon className="mt-0.5 h-6 w-6 shrink-0" />
      <span className="min-w-0 flex-1">
        <b className="block text-[16px]">{title}</b>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">{text}</span>
      </span>
      <span className={cn("mt-1 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors", on ? "bg-fg" : "bg-fg/15")}>
        <span className={cn("h-5 w-5 rounded-full bg-bg transition-transform", on && "translate-x-5")} />
      </span>
    </button>
  );
}

/* ---------------- page ---------------- */

export default function OnboardingPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const lib = useLibrary();
  const [step, setStep] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [picked, setPicked] = useState<Map<string, Artist>>(new Map());
  const [countries, setCountries] = useState<string[]>([]);
  const [langs, setLangs] = useState<string[]>([]);
  const [skipAds, setSkipAds] = useState(true);
  const [skipTalk, setSkipTalk] = useState(false);
  const [smart, setSmart] = useState(false);
  const [saving, setSaving] = useState(false);

  // prefill from earlier answers (re-taking the survey) or the device locale
  useEffect(() => {
    if (!hydrated) return;
    const st = useLibrary.getState();
    if (st.radioPrefs.surveyed) {
      setTags(st.radioTags);
      setCountries(st.radioPrefs.countries);
      setLangs(st.radioPrefs.langs);
      setSkipAds(st.radioPrefs.skipAds);
      setSkipTalk(st.radioPrefs.skipTalk);
      setSmart(st.radioPrefs.autoSwitch);
      setPicked(new Map(st.artists.filter((a) => a.id).map((a) => [a.id!, { id: a.id!, name: a.name, picture: a.thumbnail ?? "" }])));
    } else {
      const cc = guessCountry();
      if (cc) setCountries([cc]);
    }
  }, [hydrated]);

  const flip = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const canNext = step === 0 ? tags.length > 0 : true;
  const titles = useMemo(
    () => [
      [tx("Что вы любите слушать?"), tx("Выберите жанры — по ним мы соберём ваши станции.")],
      [tx("Любимые артисты"), tx("Отметьте хотя бы трёх — их песни в эфире будут первыми в очереди.")],
      [tx("Откуда слушаем?"), tx("Станции каких стран показывать первыми. Можно выбрать несколько.")],
      [tx("Реклама и разговоры"), tx("Мы следим за эфиром и переключаем станцию, когда начинается то, чего вы не хотите слышать.")],
    ],
    [],
  );

  const finish = (skip = false) => {
    setSaving(true);
    const st = useLibrary.getState();
    if (!skip) {
      st.setRadioTags(tags.length ? tags : st.radioTags);
      for (const a of picked.values()) st.followArtist({ id: a.id, name: a.name, thumbnail: a.picture });
    }
    st.setRadioPrefs(skip ? { surveyed: true } : { countries, langs, skipAds, skipTalk, autoSwitch: smart, surveyed: true });
    st.setOnboarded(true);
    router.replace("/");
  };

  const [title, sub] = titles[step]!;

  return (
    <div className="fixed inset-0 z-[58] overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col px-5 pt-safe">
        <header className="sticky top-0 z-10 -mx-5 bg-bg/90 px-5 pt-4 pb-3 backdrop-blur">
          <div className="flex items-center gap-3">
            {step > 0 ? (
              <button type="button" onClick={() => setStep(step - 1)} className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full" aria-label={tx("Назад")}>
                <ChevronLeft className="h-6 w-6" />
              </button>
            ) : (
              <Logo className="h-7 w-7" />
            )}
            <div className="flex flex-1 gap-1.5">
              {Array.from({ length: STEPS }, (_, i) => (
                <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-fg/10">
                  <motion.div className="h-full bg-fg" initial={false} animate={{ width: i <= step ? "100%" : "0%" }} transition={{ duration: 0.3 }} />
                </div>
              ))}
            </div>
            <button type="button" onClick={() => finish(true)} className="text-[13.5px] font-medium text-subtle hover:text-fg">
              {tx("Пропустить")}
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
            className="flex-1 pt-4 pb-32"
          >
            {step === 0 && !lib.radioPrefs.surveyed && (
              <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-amber-300">
                <Sparkles className="h-4 w-4" /> {tx("Настроим радио под вас — это займёт минуту")}
              </div>
            )}
            <h1 className="text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
            <p className="mt-1.5 mb-6 text-[15px] leading-snug text-muted">{sub}</p>

            {step === 0 && <GenresStep tags={tags} toggle={(t) => setTags((x) => flip(x, t))} />}
            {step === 1 && (
              <ArtistsStep
                tags={tags}
                picked={picked}
                toggle={(a) =>
                  setPicked((m) => {
                    const n = new Map(m);
                    if (n.has(a.id)) n.delete(a.id);
                    else n.set(a.id, a);
                    return n;
                  })
                }
              />
            )}
            {step === 2 && (
              <PlacesStep
                countries={countries}
                toggleCountry={(c) => setCountries((x) => flip(x, c))}
                langs={langs}
                toggleLang={(l) => setLangs((x) => flip(x, l))}
              />
            )}
            {step === 3 && (
              <div className="space-y-3">
                <Toggle
                  on={skipAds}
                  onClick={() => setSkipAds(!skipAds)}
                  icon={Megaphone}
                  title={tx("Уходить от рекламы")}
                  text={tx("Когда на станции начинается рекламный блок, переключим на ту, где сейчас играет музыка.")}
                />
                <Toggle
                  on={skipTalk}
                  onClick={() => setSkipTalk(!skipTalk)}
                  icon={MessageSquare}
                  title={tx("Только музыка")}
                  text={tx("Также переключать во время новостей, болтовни ведущих и джинглов.")}
                />
                <Toggle
                  on={smart}
                  onClick={() => setSmart(!smart)}
                  icon={Sparkles}
                  title={tx("Автопереход на ваши песни")}
                  text={tx("Если на другой станции только что началась ваша песня или артист — сразу перенесём вас туда. Выключено — просто покажем подсказку.")}
                />
                <p className="pt-2 text-[12.5px] leading-snug text-subtle">
                  {tx("Распознаём по данным, которые станции передают в эфире. Не все станции их отправляют, поэтому иногда реклама может проскочить.")}
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-5 pt-8 pb-safe">
        <div className="mx-auto flex max-w-2xl items-center gap-3 pb-4">
          <span className="flex-1 text-[13px] text-subtle">
            {step === 0 && tx("Выбрано: {n}", { n: tags.length })}
            {step === 1 && tx("Выбрано: {n}", { n: picked.size })}
            {step === 2 && (countries.length ? countries.map(flag).join(" ") : tx("Весь мир"))}
          </span>
          <button
            type="button"
            disabled={!canNext || saving}
            onClick={() => (step < STEPS - 1 ? setStep(step + 1) : finish())}
            className="flex h-12 items-center gap-2 rounded-full bg-fg px-7 text-[16px] font-semibold text-bg transition-opacity disabled:opacity-30"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {step < STEPS - 1 ? tx("Далее") : tx("Слушать радио")}
          </button>
        </div>
      </div>
    </div>
  );
}
