export interface ThemeDef {
  id: string;
  /** i18n key */
  name: string;
  scheme: "dark" | "light";
  bg: string;
  card: string;
  fg: string;
}

export const THEMES: ThemeDef[] = [
  { id: "graphite", name: "Графит", scheme: "dark", bg: "#09090b", card: "#111113", fg: "#fafafa" },
  { id: "oled", name: "Чёрная (OLED)", scheme: "dark", bg: "#000000", card: "#0b0b0c", fg: "#fafafa" },
  { id: "midnight", name: "Полночь", scheme: "dark", bg: "#0a0f1f", card: "#10172d", fg: "#eef2ff" },
  { id: "forest", name: "Лес", scheme: "dark", bg: "#08110d", card: "#0f1a15", fg: "#ecfdf3" },
  { id: "rose", name: "Вино", scheme: "dark", bg: "#13090d", card: "#1b1015", fg: "#fff1f6" },
  { id: "light", name: "Светлая", scheme: "light", bg: "#f7f7f8", card: "#ffffff", fg: "#0b0b0d" },
  { id: "sepia", name: "Сепия", scheme: "light", bg: "#f5efe4", card: "#fffaf1", fg: "#2a2017" },
];

export function themeById(id: string | undefined): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

/** Applies the theme to <html> and the browser chrome (status bar / theme-color). */
export function applyTheme(id: string) {
  const t = themeById(id);
  const root = document.documentElement;
  if (t.id === "graphite") delete root.dataset.theme;
  else root.dataset.theme = t.id;
  root.style.colorScheme = t.scheme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", t.bg));
  document.documentElement.style.backgroundColor = t.bg;
}

/** Inline script for <head>: applies the saved theme before first paint (no flash). */
export const THEME_BOOT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem("freemusic-library")||"{}").state||{};var t=s.theme;if(t&&t!=="graphite"){document.documentElement.dataset.theme=t;}var l=s.lang;if(l)document.documentElement.lang=l;}catch(e){}`;
