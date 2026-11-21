-- FreeMusic database schema (v2).
-- Run the whole file in Supabase → SQL Editor → Run. Safe to run again.

-- ───────────────────────── Shared track catalog ─────────────────────────
-- Metadata only (title/artist/cover). Shared between users — no personal data here.
create table if not exists public.tracks (
  id         text primary key,
  title      text not null,
  artist     text not null,
  artist_id  text,
  album      text,
  album_id   text,
  duration   integer not null default 0,
  cover      text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.tracks enable row level security;
drop policy if exists "tracks read" on public.tracks;
create policy "tracks read" on public.tracks for select to authenticated using (true);
drop policy if exists "tracks insert" on public.tracks;
create policy "tracks insert" on public.tracks for insert to authenticated with check (true);
drop policy if exists "tracks update" on public.tracks;
create policy "tracks update" on public.tracks for update to authenticated using (true) with check (true);

-- ───────────────────────── Likes / dislikes ─────────────────────────
create table if not exists public.likes (
  user_id    uuid not null references auth.users (id) on delete cascade,
  track_id   text not null references public.tracks (id) on delete cascade,
  value      smallint not null check (value in (-1, 1)),   -- 1 = like, -1 = dislike
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);
create index if not exists likes_user_idx on public.likes (user_id, created_at desc);

-- ───────────────────────── Playlists ─────────────────────────
create table if not exists public.playlists (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists playlists_user_idx on public.playlists (user_id);

create table if not exists public.playlist_items (
  playlist_id text not null references public.playlists (id) on delete cascade,
  track_id    text not null references public.tracks (id) on delete cascade,
  position    integer not null,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, track_id)
);

-- ───────────────────────── Taste: chosen artists ─────────────────────────
create table if not exists public.user_artists (
  user_id    uuid not null references auth.users (id) on delete cascade,
  artist_key text not null,          -- normalized name, used for scoring
  artist_id  text,                   -- YouTube Music channel id
  name       text not null,
  thumbnail  text,
  created_at timestamptz not null default now(),
  primary key (user_id, artist_key)
);

-- ───────────────────────── Listening history ─────────────────────────
create table if not exists public.plays (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  track_id   text not null,
  artist_key text not null,
  played_at  timestamptz not null,
  listened_s integer not null default 0,
  completed  boolean not null default false,
  skipped    boolean not null default false
);
create index if not exists plays_user_idx on public.plays (user_id, played_at desc);

-- ───────────────────────── Misc per-user state ─────────────────────────
create table if not exists public.user_state (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  last_queue     jsonb not null default '{"tracks":[],"index":0,"radio":true}'::jsonb,
  search_history jsonb not null default '[]'::jsonb,
  onboarded      boolean not null default false,
  updated_at     timestamptz not null default now()
);

-- ───────────────────────── Row level security ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['likes', 'playlists', 'user_artists', 'plays', 'user_state'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end $$;

alter table public.playlist_items enable row level security;
drop policy if exists "own playlist items" on public.playlist_items;
create policy "own playlist items" on public.playlist_items for all to authenticated
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid()));

-- Old v1 table (one JSON blob per user). No longer used by the app; data is migrated
-- automatically from the device on first sign-in. You can drop it later:
--   drop table if exists public.user_library;

notify pgrst, 'reload schema';
