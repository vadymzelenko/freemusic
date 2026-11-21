-- FreeMusic: one row per user holding their library (likes, playlists,
-- search history, last queue) as JSON. Run this once in Supabase → SQL Editor.

create table if not exists public.user_library (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_library enable row level security;

-- Each user can only see and change their own row.
drop policy if exists "own library select" on public.user_library;
create policy "own library select" on public.user_library
  for select using (auth.uid() = user_id);

drop policy if exists "own library insert" on public.user_library;
create policy "own library insert" on public.user_library
  for insert with check (auth.uid() = user_id);

drop policy if exists "own library update" on public.user_library;
create policy "own library update" on public.user_library
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own library delete" on public.user_library;
create policy "own library delete" on public.user_library
  for delete using (auth.uid() = user_id);
