import { pluralWord } from "./i18n";

export const tracksWord = (n: number) => `${n} ${pluralWord(n, "track")}`;
export const artistsWord = (n: number) => `${n} ${pluralWord(n, "artist")}`;
