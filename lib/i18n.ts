import en from "./locales/en";
import pl from "./locales/pl";

/*
 * Minimal i18n: the Russian UI string itself is the key.
 *   tx("Главная") → "Home" / "Strona główna"
 *   tx("Скачиваем {n}", { n: 3 })
 * Missing translations fall back to Russian, so nothing ever renders empty.
 * The current language is module state; <LangGate> re-mounts the UI when it changes.
 */

export type Lang = "ru" | "en" | "pl";
export const LANGS: Lang[] = ["ru", "en", "pl"];

const DICTS: Record<Exclude<Lang, "ru">, Record<string, string>> = { en, pl };

let current: Lang = "ru";

export function setCurrentLang(l: Lang) {
  current = l;
}
export function getCurrentLang(): Lang {
  return current;
}

export function detectLang(): Lang {
  if (typeof navigator === "undefined") return "ru";
  for (const l of navigator.languages ?? [navigator.language]) {
    const c = l.toLowerCase();
    if (c.startsWith("pl")) return "pl";
    if (c.startsWith("ru") || c.startsWith("uk") || c.startsWith("be") || c.startsWith("kk")) return "ru";
    if (c.startsWith("en")) return "en";
  }
  return "en";
}

export function resolveLang(pref: string | undefined): Lang {
  return LANGS.includes(pref as Lang) ? (pref as Lang) : detectLang();
}

export function tx(key: string, vars?: Record<string, string | number>): string {
  let s = key;
  if (current !== "ru") {
    const d = DICTS[current];
    const core = key.trim();
    const hit = d[key] ?? d[core];
    if (hit !== undefined) s = d[key] !== undefined ? hit : key.replace(core, hit);
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
  return s;
}

/** Plural word for counts, per language. */
export function pluralWord(n: number, kind: "track" | "artist"): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (current === "en") return kind === "track" ? (n === 1 ? "track" : "tracks") : n === 1 ? "artist" : "artists";
  if (current === "pl") {
    const forms = kind === "track" ? ["utwór", "utwory", "utworów"] : ["artysta", "artystów", "artystów"];
    if (n === 1) return forms[0]!;
    if (b >= 2 && b <= 4 && !(a >= 12 && a <= 14)) return forms[1]!;
    return forms[2]!;
  }
  const forms = kind === "track" ? ["трек", "трека", "треков"] : ["артист", "артиста", "артистов"];
  if (a > 10 && a < 20) return forms[2]!;
  if (b > 1 && b < 5) return forms[1]!;
  if (b === 1) return forms[0]!;
  return forms[2]!;
}

export function dateLocale(): string {
  return current === "en" ? "en-GB" : current === "pl" ? "pl-PL" : "ru-RU";
}
