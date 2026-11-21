# FreeMusic

Минималистичное музыкальное PWA (Next.js App Router + TypeScript + Tailwind v4), которое стримит аудио из YouTube Music через `youtubei.js` и продолжает играть в фоне на iPhone при заблокированном экране.

## Запуск

```bash
npm install
npm run dev        # http://localhost:3000
```

### Деплой на Vercel

1. Импортируйте репозиторий на vercel.com → **New Project** (фреймворк определится сам).
2. Переменные окружения (все необязательные, пример — `.env.example`):
   | Переменная | Назначение |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Включают вход через Google и облачную синхронизацию (см. ниже). Без них данные живут только в браузере. |
   | `YT_COOKIE` | Cookie вашего аккаунта YouTube — только если YouTube блокирует сервер Vercel ошибкой «Sign in to confirm you're not a bot». |
   | `YT_CLIENTS` | Порядок InnerTube-клиентов для получения потока, по умолчанию `ANDROID_VR,IOS,TV,WEB_EMBEDDED,MWEB`. |
   | `YT_LOCATION` | Регион каталога (`US` по умолчанию). |
   | `NEXT_PUBLIC_STREAM_API_URL` | Адрес отдельного сервера для `/api/*`. Пусто — API работает в этом же проекте на Vercel. |
3. На iPhone: Safari → «Поделиться» → **На экран «Домой»**.

### Supabase + вход через Google

1. Создайте проект на [supabase.com](https://supabase.com).
2. **SQL Editor** → вставьте содержимое `supabase/schema.sql` → **Run**. Создастся таблица `user_library` с RLS: каждый пользователь видит только свою строку.
3. **Google Cloud Console** → APIs & Services → Credentials → **Create OAuth client ID** (Web application).
   - Authorized redirect URI: `https://<ваш-проект>.supabase.co/auth/v1/callback`
4. Supabase → **Authentication → Sign In / Providers → Google** → включите, вставьте Client ID и Client Secret.
5. Supabase → **Authentication → URL Configuration**:
   - Site URL: `https://<ваш-домен>.vercel.app`
   - Redirect URLs: `https://<ваш-домен>.vercel.app/**` (и `http://localhost:3000/**` для разработки)
6. Supabase → **Project Settings → API**: скопируйте Project URL и anon (publishable) key в `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` на Vercel и сделайте Redeploy.

Кнопка «Войти» появится в «Медиатеке». При первом входе локальные лайки/плейлисты объединяются с облачными; дальше изменения отправляются в Supabase через 1,5 с, а при возвращении в приложение подтягиваются изменения с других устройств.

### Как получить `YT_COOKIE` (только если нужно)

1. В браузере на компьютере войдите в music.youtube.com (лучше отдельным, не основным аккаунтом).
2. DevTools (F12) → вкладка **Network** → обновите страницу → кликните любой запрос к `music.youtube.com` → **Request Headers** → скопируйте значение заголовка `cookie` целиком.
3. Вставьте эту строку в `YT_COOKIE` на Vercel и сделайте Redeploy. Cookie живёт несколько месяцев; никому её не показывайте — это доступ к аккаунту.

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

- Всегда: `localStorage` (zustand persist, `store/library.ts`) + синхронизация между вкладками — приложение работает и офлайн, и без аккаунта.
- После входа через Google: копия библиотеки хранится в Supabase (`lib/cloud-sync.ts`, таблица `user_library`, одна JSON-строка на пользователя).

## Ограничения

YouTube регулярно меняет защиту (PO-токены, проверка на бота для IP дата-центров). Если `/api/prepare` возвращает ошибку, сначала задайте `YT_COOKIE`, затем поменяйте порядок `YT_CLIENTS`. Используйте приложение в рамках условий YouTube.
