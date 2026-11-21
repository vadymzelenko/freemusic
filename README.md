# FreeMusic

Минималистичное музыкальное PWA (Next.js App Router + TypeScript + Tailwind v4), которое стримит аудио из YouTube Music через `youtubei.js` и продолжает играть в фоне на iPhone при заблокированном экране.

## Запуск

```bash
npm install
npm run dev        # http://localhost:3000
```

### Деплой на Vercel

1. Импортируйте репозиторий на vercel.com → **New Project** (фреймворк определится сам).
2. Переменные окружения (все необязательные):
   | Переменная | Назначение |
   |---|---|
   | `YT_COOKIE` | Cookie залогиненной сессии YouTube. Помогает, если на IP дата-центра YouTube отвечает «Sign in to confirm you're not a bot». |
   | `YT_CLIENTS` | Порядок InnerTube-клиентов для получения потока, по умолчанию `ANDROID_VR,IOS,TV,WEB_EMBEDDED,MWEB`. |
   | `YT_LOCATION` | Регион каталога (`US` по умолчанию). |
   | `NEXT_PUBLIC_STREAM_API_URL` | Базовый URL внешнего бэкенда для `/api/*`. Пусто — локальные API Routes. |
3. На iPhone: Safari → «Поделиться» → **На экран «Домой»**.

## Архитектура

```
app/
  api/search   GET ?q=   — yt.music.search (только песни), чистые метаданные, обложки 544×544
  api/related  GET ?id=  — yt.music.getUpNext(id, automix) → бесконечное радио
  api/prepare  GET ?id=  — резолвит прямую googlevideo-ссылку (m4a/AAC) и кладёт в Map с TTL 3 ч
  api/stream   GET ?id=  — прокси с поддержкой Range → 206 Partial Content
  page.tsx               — Поиск
  library/               — Любимые + плейлисты
  queue/                 — Очередь
components/player/
  PlayerProvider.tsx     — единственный <audio>, очередь, Media Session, прогрев
  MiniPlayer / FullPlayer / Scrubber
lib/yt.ts                — синглтон Innertube, JS-evaluator для дешифровки, кэши
store/library.ts         — zustand + localStorage (лайки, плейлисты, история поиска, последняя очередь)
```

### Фоновое воспроизведение на iOS

1. **Один `<audio>`** живёт в `PlayerProvider` в корневом layout и никогда не пересоздаётся — меняется только `audio.src`.
2. **Синхронный `ended`**: URL потока предсказуем (`/api/stream?id=…`), поэтому следующий трек включается сразу, без `await`. Радио заранее дозаполняет очередь, когда до конца остаётся < 3 треков, так что следующий трек всегда известен.
3. **Прогрев**: за 20 с до конца трека уходит `fetch('/api/prepare?id=NEXT')` — сервер заранее получает ссылку на поток.
4. **Media Session**: метаданные с обложкой 544×544, `playbackState`, `setPositionState`, обработчики `play/pause/nexttrack/previoustrack/seekto`.

### Стриминг

- Выбирается лучший `audio/mp4` (AAC) — Safari не воспроизводит webm/opus стабильно.
- Range-запросы клиента транслируются в параметр googlevideo `&range=start-end` (не больше 10 МБ за ответ), сервер сам формирует `Content-Range`/`Content-Length`/`Accept-Ranges` → мгновенная перемотка.
- При 403/410 от CDN (ссылка истекла или привязана к IP другого инстанса) ссылка получается заново и запрос повторяется. Если `<audio>` выдаёт ошибку, клиент один раз повторяет с `&fresh=1`, затем пропускает трек.

### Хранилище

Сейчас данные хранятся в `localStorage` и синхронизируются между вкладками (событие `storage`) — ничего настраивать не нужно. Для синхронизации между устройствами можно повесить Supabase на `store/library.ts` (вся работа с данными идёт через этот стор).

## Ограничения

YouTube регулярно меняет защиту (PO-токены, проверка на бота для IP дата-центров). Если `/api/prepare` возвращает ошибку, сначала задайте `YT_COOKIE`, затем поменяйте порядок `YT_CLIENTS`. Используйте приложение в рамках условий YouTube.
