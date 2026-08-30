-- DigiCode — Flappy Dragon leaderboard.
-- "Cycles every month" is handled at query time (WHERE created_at is in the
-- current calendar month) rather than deleting old scores, so history isn't lost.

create table public.game_scores (
  id bigint generated always as identity primary key,
  player_name text not null default 'Anonymous',
  score integer not null check (score >= 0 and score <= 2000),
  created_at timestamptz not null default now()
);

alter table public.game_scores enable row level security;

create policy "Anyone can view scores"
  on public.game_scores for select
  using (true);

create policy "Anyone can submit a score"
  on public.game_scores for insert
  with check (char_length(player_name) <= 24);
