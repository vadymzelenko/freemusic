export interface Station {
  id: string; // radio-browser stationuuid
  name: string;
  url: string; // https stream url
  favicon: string;
  homepage: string;
  tags: string[];
  country: string;
  countrycode: string;
  language: string;
  codec: string;
  bitrate: number;
  hls: boolean;
  votes: number;
}

export interface NowPlaying {
  /** raw StreamTitle */
  raw: string;
  artist: string;
  title: string;
}

export const RADIO_GENRES: { tag: string; label: string }[] = [
  { tag: "rock", label: "Рок" },
  { tag: "classic rock", label: "Классический рок" },
  { tag: "metal", label: "Метал" },
  { tag: "pop", label: "Поп" },
  { tag: "80s", label: "80-е" },
  { tag: "90s", label: "90-е" },
  { tag: "hits", label: "Хиты" },
  { tag: "dance", label: "Дэнс" },
  { tag: "electronic", label: "Электроника" },
  { tag: "hip hop", label: "Хип-хоп" },
  { tag: "jazz", label: "Джаз" },
  { tag: "chillout", label: "Чилаут" },
  { tag: "lounge", label: "Лаунж" },
  { tag: "indie", label: "Инди" },
  { tag: "classical", label: "Классика" },
  { tag: "blues", label: "Блюз" },
  { tag: "country", label: "Кантри" },
  { tag: "reggae", label: "Регги" },
];

/** "Artist - Title" → parts (handles the common "Artist – Title" / "Artist ~ Title" variants). */
export function splitStreamTitle(raw: string): NowPlaying {
  const clean = raw.replace(/\s+/g, " ").trim();
  const m = /^(.+?)\s+[-–—~|]\s+(.+)$/.exec(clean);
  if (m) return { raw: clean, artist: m[1]!.trim(), title: m[2]!.trim() };
  return { raw: clean, artist: "", title: clean };
}

/** Stable pseudo FM frequency for the tuner dial (purely cosmetic). */
export function pseudoFrequency(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const f = 87.5 + ((h % 205) / 10); // 87.5 … 107.9
  return f.toFixed(1);
}
