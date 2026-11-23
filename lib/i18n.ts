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

export function dateLocale(): string {
  return current === "en" ? "en-GB" : current === "pl" ? "pl-PL" : "ru-RU";
}
