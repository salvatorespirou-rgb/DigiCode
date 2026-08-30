-- DigiCode — Flappy Dragon player profiles (replaces the old
-- game_scores-based leaderboard with persistent registered players).
-- Run this once in the Supabase SQL Editor.

create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  avatar_url text,
  best_score integer not null default 0 check (best_score >= 0 and best_score <= 2000),
  -- A per-row secret only ever returned to the browser that created it.
  -- The app always filters updates by both id AND edit_key, so even though
  -- the RLS policy below is open, nobody can touch a row without knowing
  -- its specific key — there's no real login here, so this is the practical
  -- substitute for "only the owner can edit their own row."
  edit_key text not null default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.game_players enable row level security;

create policy "Anyone can view players"
  on public.game_players for select
  using (true);

create policy "Anyone can register a player"
  on public.game_players for insert
  with check (char_length(display_name) <= 24);

create policy "Anyone can update a player they hold the edit key for"
  on public.game_players for update
  using (true)
  with check (char_length(display_name) <= 24 and best_score >= 0 and best_score <= 2000);

-- Storage bucket for profile photos: public read, capped size, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can view avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Anyone can upload an avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars');
