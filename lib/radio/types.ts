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

/** music = a real "Artist - Title"; unknown = station only sends its name / slogan */
export type AirKind = "music" | "ad" | "talk" | "unknown";

export interface NowPlaying {
  /** raw StreamTitle */
  raw: string;
  artist: string;
  title: string;
  /** what's on air: a song, an ad break, or talk / jingles / news */
  kind: AirKind;
}

const AD_WORDS =
  /\b(werbung|reklama|reklamy|reklam|реклама|рекламн\w*|advert\w*|commercials?|ad ?break|anzeige|publicit[eé]|pubblicit[aà]|publicidad|reclame|sponsor\w*|spot ?publicitaire)\b/i;
const TALK_WORDS = /\b(news|nachrichten|новости|wiadomości|informacje|weather|wetter|погода|traffic|verkehr|jingle|station id|live show|interview)\b/i;

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Classifies a StreamTitle (+ ad marker) for the station called `stationName`.
 * Conservative on purpose: only explicit markers / words count as ad or talk,
 * so the player never jumps away from music because of a guess.
 */
export function classify(raw: string, adMarker: boolean, stationName = ""): NowPlaying {
  const np = splitStreamTitle(raw);
  let kind: AirKind = "music";
  const st = squash(stationName).slice(0, 10);
  if (adMarker || AD_WORDS.test(raw)) kind = "ad";
  else if (TALK_WORDS.test(raw)) kind = "talk";
  else if (!np.artist || (st.length >= 4 && (squash(np.artist).includes(st) || squash(raw).startsWith(st)))) kind = "unknown";
  return { ...np, kind };
}

/**
 * Genres used for the taste survey and pool building. `tag` = Radio Browser tag,
 * `dz` = Deezer genre id (artist suggestions + pictures in the survey).
 */
export const RADIO_GENRES: { tag: string; label: string; dz?: number }[] = [
  { tag: "pop", label: "Поп", dz: 132 },
  { tag: "rock", label: "Рок", dz: 152 },
  { tag: "hits", label: "Хиты" },
  { tag: "dance", label: "Дэнс", dz: 113 },
  { tag: "electronic", label: "Электроника", dz: 106 },
  { tag: "hip hop", label: "Хип-хоп", dz: 116 },
  { tag: "rnb", label: "R&B", dz: 165 },
  { tag: "indie", label: "Инди", dz: 85 },
  { tag: "metal", label: "Метал", dz: 464 },
  { tag: "classic rock", label: "Классический рок" },
  { tag: "jazz", label: "Джаз", dz: 129 },
  { tag: "soul", label: "Соул и фанк", dz: 169 },
  { tag: "blues", label: "Блюз", dz: 153 },
  { tag: "chillout", label: "Чилаут" },
  { tag: "lounge", label: "Лаунж" },
  { tag: "classical", label: "Классика", dz: 98 },
  { tag: "country", label: "Кантри", dz: 84 },
  { tag: "reggae", label: "Регги", dz: 144 },
  { tag: "latin", label: "Латино", dz: 197 },
  { tag: "folk", label: "Фолк", dz: 466 },
  { tag: "soundtrack", label: "Саундтреки", dz: 173 },
];

/** Decades are tags too, but they look better as their own row in the survey. */
export const RADIO_ERAS: { tag: string; label: string }[] = [
  { tag: "60s", label: "60-е" },
  { tag: "70s", label: "70-е" },
  { tag: "80s", label: "80-е" },
  { tag: "90s", label: "90-е" },
  { tag: "00s", label: "2000-е" },
  { tag: "oldies", label: "Ретро" },
];

export const tagLabel = (tag: string) => RADIO_GENRES.find((g) => g.tag === tag)?.label ?? RADIO_ERAS.find((g) => g.tag === tag)?.label ?? tag;

/** "PL" → 🇵🇱 */
export function flag(cc: string): string {
  if (!/^[A-Za-z]{2}$/.test(cc)) return "🌐";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

/** "Artist - Title" → parts (handles the common "Artist – Title" / "Artist ~ Title" variants). */
export function splitStreamTitle(raw: string): Omit<NowPlaying, "kind"> {
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
